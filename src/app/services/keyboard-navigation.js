import { default as Service } from "@ember/service";
import Logger from "utils/Logger";


const navigationKeys = [
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Enter",
	" ",
	"Escape",
	"Backspace",
	"GamepadStart"
];

const editableElements = [
	HTMLInputElement,
	HTMLTextAreaElement,
	HTMLSelectElement
];

const defaultFocusClass = "keyboard-nav-focused";
const scrollVerticalMargin = 10;
const overlayRingClass = "keyboard-nav-overlay-ring";
const enterSelectionDelay = 600;
const inputSourceFallbackWindow = 450;
const logger = new Logger( "keyboard-navigation" );


export default Service.extend({
	zones: null,
	zoneState: null,
	overlayRing: null,
	isKeyboardMode: false,
	pointerDownListener: null,
	pointerMoveListener: null,
	overlayMutationObserver: null,
	overlayRefreshRafId: null,
	selectionSuppressedUntil: 0,
	selectionSuppressTimeoutId: null,
	activeInputSource: "keyboard",
	controlMode: "keyboard",
	lastInputSource: "keyboard",
	lastInputSourceUntil: 0,

	init() {
		this._super( ...arguments );
		this.zones = [];
		this.zoneState = new Map();
		this._setupOverlayRing();
		this._bindOverlayListeners();
		this._bindInputModeListeners();
	},

	willDestroy() {
		this._clearSelectionSuppressTimeout();
		this._unbindInputModeListeners();
		this._unbindOverlayListeners();
		this._teardownOverlayRing();
		this._super( ...arguments );
	},

	registerZone( zone ) {
		if ( !zone || !zone.id ) {
			return;
		}

		this.unregisterZone( zone.id );
		this.zones.unshift( zone );
		this.zoneState.set( zone.id, { index: -1, focused: null, ringTarget: null } );
	},

	focusZone( zoneId, position = "first" ) {
		const zone = this.zones.find( item => item.id === zoneId );
		if ( !zone ) {
			return false;
		}

		const root = this._resolveRoot( zone );
		if ( !root || !root.isConnected ) {
			return false;
		}

		const elements = this._getElements( zone, root );
		if ( !elements.length ) {
			return false;
		}

		const state = this._getZoneState( zone );
		const index = position === "last" ? elements.length - 1 : 0;

		return this._focusElement( zone, state, elements, index );
	},

	isZoneFocused( zoneId ) {
		const zone = this.zones.find( item => item.id === zoneId );

		if ( !zone ) {
			return false;
		}

		const state = this.zoneState.get( zone.id );

		return !!( state && state.focused && state.focused.isConnected );
	},

	focusFirstContentZone( excludeZoneId = null ) {
		const isEligible = zone => zone.id !== "main-menu" && zone.id !== excludeZoneId;

		const pickTopZone = matcher => {
			let picked = null;

			for ( const zone of this.zones ) {
				if ( !isEligible( zone ) || !matcher( zone ) ) {
					continue;
				}

				const root = this._resolveRoot( zone );

				if ( !root || !root.isConnected ) {
					continue;
				}

				const elements = this._getElements( zone, root );

				if ( !elements.length ) {
					continue;
				}

				const top = root.getBoundingClientRect().top;

				if ( !picked || top < picked.top ) {
					picked = {
						zone,
						elements,
						top
					};
				}
			}

			if ( !picked ) {
				return false;
			}

			const state = this._getZoneState( picked.zone );
			return this._focusElement( picked.zone, state, picked.elements, 0 );
		};

		if ( pickTopZone( zone => zone.id.startsWith( "content-list-" ) ) ) {
			return true;
		}

		if ( pickTopZone( () => true ) ) {
			return true;
		}

		return false;
	},

	focusAdjacentContentZone( currentZoneId, direction = "down" ) {
		const currentZone = this.zones.find( zone => zone.id === currentZoneId );

		if ( !currentZone ) {
			return false;
		}

		const currentRoot = this._resolveRoot( currentZone );

		if ( !currentRoot || !currentRoot.isConnected ) {
			return false;
		}

		const currentRect = currentRoot.getBoundingClientRect();
		const currentCenterY = currentRect.top + currentRect.height / 2;
		const currentCenterX = currentRect.left + currentRect.width / 2;

		let bestZone = null;
		let bestPrimary = Number.POSITIVE_INFINITY;
		let bestSecondary = Number.POSITIVE_INFINITY;

		for ( const zone of this.zones ) {
			if ( zone.id === currentZoneId || !zone.id.startsWith( "content-list-" ) ) {
				continue;
			}

			const root = this._resolveRoot( zone );

			if ( !root || !root.isConnected ) {
				continue;
			}

			const elements = this._getElements( zone, root );

			if ( !elements.length ) {
				continue;
			}

			const rect = root.getBoundingClientRect();
			const centerY = rect.top + rect.height / 2;
			const centerX = rect.left + rect.width / 2;

			const primary = direction === "up"
				? currentCenterY - centerY
				: centerY - currentCenterY;

			if ( primary <= 0 ) {
				continue;
			}

			const secondary = Math.abs( centerX - currentCenterX );

			if (
				primary < bestPrimary
				|| (
					primary === bestPrimary
					&& secondary < bestSecondary
				)
			) {
				bestPrimary = primary;
				bestSecondary = secondary;
				bestZone = zone;
			}
		}

		if ( !bestZone ) {
			return false;
		}

		return this.focusZone( bestZone.id, direction === "up" ? "last" : "first" );
	},

	unregisterZone( zoneOrId ) {
		const id = typeof zoneOrId === "string"
			? zoneOrId
			: zoneOrId && zoneOrId.id;

		if ( !id ) {
			return;
		}

		const index = this.zones.findIndex( zone => zone.id === id );
		if ( index !== -1 ) {
			const zone = this.zones[ index ];
			const state = this.zoneState.get( id );

			if ( state && state.focused ) {
				state.focused.classList.remove( this._getFocusClass( zone ) );
				this._hideOverlayRing();
			}

			this.zones.splice( index, 1 );
		}

		this.zoneState.delete( id );
	},

	trigger( event ) {
		const isNavigationKey = navigationKeys.indexOf( event.key ) !== -1;
		const isBackKey = event.key === "Escape" || event.key === "Backspace";
		const inputSource = this._resolveInputSource( event );

		if ( !isNavigationKey ) {
			return;
		}

		if (
			this._isEditableTarget( event.target )
			&& inputSource !== "gamepad"
			&& !this._canNavigateFromEditableTarget( event )
		) {
			return;
		}

		event.inputSource = inputSource;
		this.activeInputSource = event.inputSource;
		this._setControlMode( event.inputSource );

		this.isKeyboardMode = true;

		if ( this._isSelectionSuppressed() && !isBackKey ) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return false;
		}

		const focusedZone = this._getFocusedZone();
		if ( focusedZone ) {
			const focusedRoot = this._resolveRoot( focusedZone );

			if ( focusedRoot && focusedRoot.isConnected ) {
				if ( this._handleZoneEvent( focusedZone, focusedRoot, event ) ) {
					if ( this._shouldSuppressSelectionOnEnter( focusedZone, event ) ) {
						this._suppressSelectionFor( enterSelectionDelay );
					}

					event.preventDefault();
					event.stopImmediatePropagation();
					return false;
				}
			}
		}

		const activeElement = document.activeElement;

		for ( const zone of this.zones ) {
			const root = this._resolveRoot( zone );

			if ( !root || !root.isConnected ) {
				continue;
			}

			const elements = this._getElements( zone, root );

			if ( elements.indexOf( activeElement ) === -1 ) {
				continue;
			}

			if ( this._handleZoneEvent( zone, root, event ) ) {
				if ( this._shouldSuppressSelectionOnEnter( zone, event ) ) {
					this._suppressSelectionFor( enterSelectionDelay );
				}

				event.preventDefault();
				event.stopImmediatePropagation();
				return false;
			}

			if (
				isBackKey
				&& zone.id !== "main-menu"
				&& this.focusZone( "main-menu", "first" )
			) {
				event.preventDefault();
				event.stopImmediatePropagation();
				return false;
			}

			return;
		}

		for ( const zone of this.zones ) {
			const root = this._resolveRoot( zone );

			if ( !root || !root.isConnected ) {
				continue;
			}

			if ( this._handleZoneEvent( zone, root, event ) ) {
				if ( this._shouldSuppressSelectionOnEnter( zone, event ) ) {
					this._suppressSelectionFor( enterSelectionDelay );
				}

				event.preventDefault();
				event.stopImmediatePropagation();
				return false;
			}
		}

		if ( isBackKey && this.focusZone( "main-menu", "first" ) ) {
			event.preventDefault();
			event.stopImmediatePropagation();
			return false;
		}
	},

	_resolveRoot( zone ) {
		return typeof zone.element === "function"
			? zone.element()
			: zone.element;
	},

	_shouldSuppressSelectionOnEnter( zone, event ) {
		return event.key === "Enter" && zone.suppressSelectionOnEnter !== false;
	},

	_getFocusedZone() {
		for ( const zone of this.zones ) {
			const state = this.zoneState.get( zone.id );

			if ( !state || !state.focused || !state.focused.isConnected ) {
				continue;
			}

			const root = this._resolveRoot( zone );

			if ( !root || !root.isConnected || !root.contains( state.focused ) ) {
				continue;
			}

			return zone;
		}

		return null;
	},

	_setControlMode( mode ) {
		const nextMode = mode === "gamepad"
			? "gamepad"
			: mode === "pointer"
				? "pointer"
				: "keyboard";

		if ( this.controlMode === nextMode ) {
			return;
		}

		this.controlMode = nextMode;
		logger.logDebug( `mode=${nextMode}` );
	},

	markInputSource( source, duration = inputSourceFallbackWindow ) {
		this.lastInputSource = source || "keyboard";
		this.lastInputSourceUntil = Date.now() + duration;
	},

	_resolveInputSource( event ) {
		if ( event && event.inputSource ) {
			this.markInputSource( event.inputSource );
			return event.inputSource;
		}

		if ( Date.now() <= this.lastInputSourceUntil ) {
			return this.lastInputSource || "keyboard";
		}

		return "keyboard";
	},

	_canNavigateFromEditableTarget( event ) {
		if ( !event ) {
			return false;
		}

		const isDirectionKey = event.key === "ArrowUp"
			|| event.key === "ArrowDown"
			|| event.key === "ArrowLeft"
			|| event.key === "ArrowRight";

		if ( !isDirectionKey ) {
			return false;
		}

		const focusedZone = this._getFocusedZone();

		if ( focusedZone && focusedZone.allowEditableDirectionNavigation === true ) {
			return true;
		}

		const targetZone = this._findZoneByTarget( event.target );

		return !!(
			targetZone
			&& targetZone.allowEditableDirectionNavigation === true
		);
	},

	_findZoneByTarget( target ) {
		if ( !( target instanceof Element ) ) {
			return null;
		}

		for ( const zone of this.zones ) {
			const root = this._resolveRoot( zone );

			if ( !root || !root.isConnected ) {
				continue;
			}

			if ( root === target || root.contains( target ) ) {
				return zone;
			}
		}

		return null;
	},

	_isEditableTarget( target ) {
		if ( !target ) {
			return false;
		}

		return editableElements.some( Type => target instanceof Type )
			|| target.isContentEditable;
	},

	_getElements( zone, root ) {
		const selector = zone.selector || "a,button,[tabindex]";

		return Array.from( root.querySelectorAll( selector ) )
			.filter( element => {
				if ( this._isElementDisabled( element ) ) {
					return false;
				}

				if ( !this._isElementVisible( element ) ) {
					return false;
				}

				return this._isElementClickable( element );
			});
	},

	_isElementDisabled( element ) {
		if ( !element ) {
			return true;
		}

		return !!element.disabled
			|| element.hasAttribute( "disabled" )
			|| element.getAttribute( "aria-disabled" ) === "true";
	},

	_isElementVisible( element ) {
		if ( !element ) {
			return false;
		}

		if ( element.hidden || element.getAttribute( "aria-hidden" ) === "true" ) {
			return false;
		}

		if ( element.getClientRects().length === 0 ) {
			return false;
		}

		const style = window.getComputedStyle( element );
		if ( style.display === "none" || style.visibility === "hidden" ) {
			return false;
		}

		return Number.parseFloat( style.opacity || "1" ) > 0;
	},

	_isElementClickable( element ) {
		if ( !element ) {
			return false;
		}

		if ( element.matches(
			"a[href],button,input:not([type='hidden']),select,textarea,summary"
		) ) {
			return true;
		}

		if ( element.matches( "[data-ember-action],[onclick],[role='button'],[role='link']" ) ) {
			return true;
		}

		if ( element.matches( "li[class*='-item-component']" ) ) {
			return true;
		}

		if ( element.querySelector(
			"a[href],button,[data-ember-action],[onclick],"
			+ "input:not([type='hidden']),select,textarea,[role='button'],[role='link']"
		) ) {
			return true;
		}

		const style = window.getComputedStyle( element );
		return element.tabIndex >= 0 && style.cursor === "pointer";
	},

	_getFocusClass( zone ) {
		return zone.focusClass || defaultFocusClass;
	},

	_getZoneState( zone ) {
		if ( !this.zoneState.has( zone.id ) ) {
			this.zoneState.set( zone.id, { index: -1, focused: null, ringTarget: null } );
		}

		return this.zoneState.get( zone.id );
	},

	clearFocus() {
		this._clearAllFocusClasses();

		const activeElement = document.activeElement;
		if (
			activeElement
			&& activeElement !== document.body
			&& activeElement.blur instanceof Function
		) {
			activeElement.blur();
		}
	},

	_clearAllFocusClasses() {
		for ( const zone of this.zones ) {
			const state = this.zoneState.get( zone.id );

			if ( !state || !state.focused ) {
				continue;
			}

			state.focused.classList.remove( this._getFocusClass( zone ) );
			state.focused = null;
			state.ringTarget = null;
		}

		this._hideOverlayRing();
	},

	_setupOverlayRing() {
		if ( this.overlayRing || !document || !document.body ) {
			return;
		}

		const ring = document.createElement( "ring" );
		ring.className = overlayRingClass;
		document.body.appendChild( ring );
		this.overlayRing = ring;
	},

	_teardownOverlayRing() {
		if ( !this.overlayRing ) {
			return;
		}

		if ( this.overlayRing.parentNode ) {
			this.overlayRing.parentNode.removeChild( this.overlayRing );
		}

		this.overlayRing = null;
	},

	_bindOverlayListeners() {
		this._overlayListener = () => this._scheduleOverlayRefresh();
		window.addEventListener( "resize", this._overlayListener, true );
		window.addEventListener( "scroll", this._overlayListener, true );

		if ( document && document.body && window.MutationObserver ) {
			this.overlayMutationObserver = new MutationObserver(
				() => this._scheduleOverlayRefresh()
			);
			this.overlayMutationObserver.observe( document.body, {
				subtree: true,
				childList: true,
				attributes: true,
				attributeFilter: [
					"class",
					"style",
					"hidden",
					"aria-hidden",
					"disabled",
					"aria-disabled"
				]
			});
		}
	},

	_bindInputModeListeners() {
		this.pointerDownListener = () => this._setPointerMode();
		this.pointerMoveListener = () => this._setPointerMode();

		window.addEventListener( "mousedown", this.pointerDownListener, true );
		window.addEventListener( "mousemove", this.pointerMoveListener, true );
	},

	_unbindOverlayListeners() {
		if ( !this._overlayListener ) {
			if ( this.overlayMutationObserver ) {
				this.overlayMutationObserver.disconnect();
				this.overlayMutationObserver = null;
			}

			if ( this.overlayRefreshRafId !== null ) {
				window.cancelAnimationFrame( this.overlayRefreshRafId );
				this.overlayRefreshRafId = null;
			}

			return;
		}

		window.removeEventListener( "resize", this._overlayListener, true );
		window.removeEventListener( "scroll", this._overlayListener, true );
		this._overlayListener = null;

		if ( this.overlayMutationObserver ) {
			this.overlayMutationObserver.disconnect();
			this.overlayMutationObserver = null;
		}

		if ( this.overlayRefreshRafId !== null ) {
			window.cancelAnimationFrame( this.overlayRefreshRafId );
			this.overlayRefreshRafId = null;
		}
	},

	_scheduleOverlayRefresh() {
		if ( this.overlayRefreshRafId !== null ) {
			return;
		}

		this.overlayRefreshRafId = window.requestAnimationFrame( () => {
			this.overlayRefreshRafId = null;
			this._refreshOverlayFromState();
		});
	},

	_unbindInputModeListeners() {
		if ( this.pointerDownListener ) {
			window.removeEventListener( "mousedown", this.pointerDownListener, true );
			this.pointerDownListener = null;
		}

		if ( this.pointerMoveListener ) {
			window.removeEventListener( "mousemove", this.pointerMoveListener, true );
			this.pointerMoveListener = null;
		}
	},

	_setPointerMode() {
		if ( !this.isKeyboardMode ) {
			this._setControlMode( "pointer" );
			return;
		}

		this.isKeyboardMode = false;
		this.markInputSource( "pointer" );
		this.activeInputSource = "pointer";
		this._setControlMode( "pointer" );
		this._clearAllFocusClasses();
	},

	_clearSelectionSuppressTimeout() {
		if ( this.selectionSuppressTimeoutId === null ) {
			return;
		}

		window.clearTimeout( this.selectionSuppressTimeoutId );
		this.selectionSuppressTimeoutId = null;
	},

	_isSelectionSuppressed() {
		return this.selectionSuppressedUntil > Date.now();
	},

	_suppressSelectionFor( duration ) {
		this.clearFocus();
		this.selectionSuppressedUntil = Date.now() + duration;
		this._clearSelectionSuppressTimeout();

		this.selectionSuppressTimeoutId = window.setTimeout( () => {
			this.selectionSuppressedUntil = 0;
			this.selectionSuppressTimeoutId = null;
		}, duration );
	},

	_refreshOverlayFromState() {
		if ( !this.isKeyboardMode ) {
			this._hideOverlayRing();
			return;
		}

		for ( const zone of this.zones ) {
			const state = this.zoneState.get( zone.id );
			const focusedElement = state && state.focused;
			const root = this._resolveRoot( zone );

			if ( !state || !focusedElement ) {
				continue;
			}

			if ( !root || !root.isConnected || !root.contains( focusedElement ) ) {
				this._resetZoneState( zone, state );
				continue;
			}

			if ( !focusedElement.isConnected || !this._isElementVisible( focusedElement ) ) {
				this._resetZoneState( zone, state );
				continue;
			}

			let ringTarget = this._resolveRingTarget( zone, focusedElement );

			if ( !ringTarget || !ringTarget.isConnected || !this._isElementVisible( ringTarget ) ) {
				ringTarget = focusedElement;
			}

			if ( !ringTarget || !this._isElementVisible( ringTarget ) ) {
				this._resetZoneState( zone, state );
				continue;
			}

			state.ringTarget = ringTarget;

			this._showOverlayRing( ringTarget );
			return;
		}

		this._hideOverlayRing();
	},

	_resetZoneState( zone, state ) {
		if ( state.focused && state.focused.classList instanceof DOMTokenList ) {
			state.focused.classList.remove( this._getFocusClass( zone ) );
		}

		state.index = -1;
		state.focused = null;
		state.ringTarget = null;
	},

	_resolveRingTarget( zone, element ) {
		if ( !element || !element.isConnected ) {
			return element;
		}

		if ( zone.getRingTarget instanceof Function ) {
			const target = zone.getRingTarget( element );

			if ( target && target.isConnected ) {
				return target;
			}
		}

		if ( zone.ringSelector ) {
			const target = element.matches( zone.ringSelector )
				? element
				: element.querySelector( zone.ringSelector );

			if ( target && target.isConnected ) {
				return target;
			}
		}

		return element;
	},

	_showOverlayRing( element ) {
		if ( !this.isKeyboardMode || !this.overlayRing || !element || !element.isConnected ) {
			return;
		}

		const rect = element.getBoundingClientRect();
		const left = Math.round( rect.left - 2 );
		const top = Math.round( rect.top - 2 );
		const width = Math.max( 1, Math.round( rect.width + 4 ) );
		const height = Math.max( 1, Math.round( rect.height + 4 ) );

		if ( width <= 0 || height <= 0 ) {
			this._hideOverlayRing();
			return;
		}

		this.overlayRing.style.display = "block";
		this.overlayRing.style.left = `${left}px`;
		this.overlayRing.style.top = `${top}px`;
		this.overlayRing.style.width = `${width}px`;
		this.overlayRing.style.height = `${height}px`;
	},

	_hideOverlayRing() {
		if ( !this.overlayRing ) {
			return;
		}

		this.overlayRing.style.display = "none";
	},

	_resolveIndex( state, elements, nativeActiveIndex ) {
		if ( nativeActiveIndex !== -1 ) {
			state.index = nativeActiveIndex;
			state.focused = elements[ nativeActiveIndex ];
			return nativeActiveIndex;
		}

		const stateFocusedIndex = elements.indexOf( state.focused );

		if ( stateFocusedIndex !== -1 ) {
			state.index = stateFocusedIndex;
			return stateFocusedIndex;
		}

		if (
			state.index >= 0
			&& state.index < elements.length
			&& state.focused === elements[ state.index ]
		) {
			return state.index;
		}

		state.index = -1;
		state.focused = null;
		state.ringTarget = null;

		return -1;
	},

	_findSpatialIndex( elements, activeIndex, key ) {
		if ( activeIndex < 0 || activeIndex >= elements.length ) {
			return -1;
		}

		const activeRect = elements[ activeIndex ].getBoundingClientRect();
		const activeCenterX = activeRect.left + activeRect.width / 2;
		const activeCenterY = activeRect.top + activeRect.height / 2;

		let bestIndex = -1;
		let bestPrimary = Number.POSITIVE_INFINITY;
		let bestSecondary = Number.POSITIVE_INFINITY;

		for ( let i = 0; i < elements.length; i++ ) {
			if ( i === activeIndex ) {
				continue;
			}

			const rect = elements[ i ].getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			const dx = centerX - activeCenterX;
			const dy = centerY - activeCenterY;

			let primary;
			let secondary;

			if ( key === "ArrowRight" ) {
				if ( dx <= 0 ) { continue; }
				primary = dx;
				secondary = Math.abs( dy );
			} else if ( key === "ArrowLeft" ) {
				if ( dx >= 0 ) { continue; }
				primary = -dx;
				secondary = Math.abs( dy );
			} else if ( key === "ArrowDown" ) {
				if ( dy <= 0 ) { continue; }
				primary = dy;
				secondary = Math.abs( dx );
			} else {
				if ( dy >= 0 ) { continue; }
				primary = -dy;
				secondary = Math.abs( dx );
			}

			if (
				primary < bestPrimary
				|| (
					primary === bestPrimary
					&& secondary < bestSecondary
				)
			) {
				bestPrimary = primary;
				bestSecondary = secondary;
				bestIndex = i;
			}
		}

		return bestIndex;
	},

	_onBoundary( zone, event, root, elements, activeIndex ) {
		if ( !zone.onBoundary ) {
			return false;
		}

		return zone.onBoundary(
			event,
			root,
			elements,
			activeIndex
		) === true;
	},

	_focusElement( zone, state, elements, index ) {
		const element = elements[ index ];

		if ( !element ) {
			return false;
		}

		const focusClass = this._getFocusClass( zone );

		this._clearAllFocusClasses();

		element.classList.add( focusClass );

		if ( element.tabIndex < 0 ) {
			element.setAttribute( "tabindex", "0" );
		}

		const shouldSkipNativeFocus
			= this.activeInputSource === "gamepad"
			&& this._isEditableTarget( element );

		if ( !shouldSkipNativeFocus ) {
			try {
				element.focus({ preventScroll: true });
			} catch ( e ) {
				element.focus();
			}
		}

		const ringTarget = this._resolveRingTarget( zone, element );
		this._scrollIntoViewWithMargin( element, ringTarget );
		this._showOverlayRing( ringTarget );

		state.index = index;
		state.focused = element;
		state.ringTarget = ringTarget;

		return true;
	},

	_getScrollableParents( element ) {
		const parents = [];
		let current = element && element.parentElement;

		while ( current ) {
			const style = window.getComputedStyle( current );
			const overflowY = style.overflowY;
			const isScrollable
				= overflowY === "auto"
				|| overflowY === "scroll"
				|| overflowY === "overlay";

			if ( isScrollable && current.scrollHeight > current.clientHeight ) {
				parents.push( current );
			}

			current = current.parentElement;
		}

		return parents;
	},

	_scrollContainerToKeepMargin( container, rect ) {
		const containerRect = container.getBoundingClientRect();
		const topLimit = containerRect.top + scrollVerticalMargin;
		const bottomLimit = containerRect.bottom - scrollVerticalMargin;

		if ( rect.top < topLimit ) {
			container.scrollTop -= topLimit - rect.top;
			return;
		}

		if ( rect.bottom > bottomLimit ) {
			container.scrollTop += rect.bottom - bottomLimit;
		}
	},

	_scrollViewportToKeepMargin( rect ) {
		const topLimit = scrollVerticalMargin;
		const bottomLimit = window.innerHeight - scrollVerticalMargin;

		if ( rect.top < topLimit ) {
			window.scrollBy( 0, rect.top - topLimit );
			return;
		}

		if ( rect.bottom > bottomLimit ) {
			window.scrollBy( 0, rect.bottom - bottomLimit );
		}
	},

	_scrollIntoViewWithMargin( element, ringTarget ) {
		const parents = this._getScrollableParents( element );

		if ( !parents.length ) {
			this._scrollViewportToKeepMargin( element.getBoundingClientRect() );
			return;
		}

		for ( const container of parents ) {
			const rect = element.getBoundingClientRect();
			this._scrollContainerToKeepMargin( container, rect );
		}

		window.requestAnimationFrame(
			() => this._showOverlayRing( ringTarget || element )
		);
	},

	_handleZoneEvent( zone, root, event ) {
		const state = this._getZoneState( zone );
		const elements = this._getElements( zone, root );

		if ( !elements.length ) {
			if ( state.focused ) {
				state.focused.classList.remove( this._getFocusClass( zone ) );
			}

			state.index = -1;
			state.focused = null;
			state.ringTarget = null;
			return false;
		}

		const activeElement = root.ownerDocument.activeElement;
		const nativeActiveIndex = elements.indexOf( activeElement );
		const activeIndex = this._resolveIndex( state, elements, nativeActiveIndex );
		const isInside = activeIndex !== -1;

		if ( event.key === "Escape" || event.key === "Backspace" ) {
			if ( !zone.onBack ) {
				return false;
			}

			return zone.onBack( event, root, elements, activeIndex ) !== false;
		}

		if ( event.key === "Enter" || event.key === " " ) {
			if ( zone.onConfirm ) {
				return zone.onConfirm( event, root, elements, activeIndex ) !== false;
			}

			const index = isInside ? activeIndex : 0;

			if ( !this._focusElement( zone, state, elements, index ) ) {
				return false;
			}

			elements[ index ].click();
			return true;
		}

		if ( event.key === "GamepadStart" ) {
			if ( !zone.onStart ) {
				return false;
			}

			return zone.onStart( event, root, elements, activeIndex ) !== false;
		}

		const isForward = event.key === "ArrowRight" || event.key === "ArrowDown";
		const isBackward = event.key === "ArrowLeft" || event.key === "ArrowUp";

		if ( !isForward && !isBackward ) {
			return false;
		}

		if ( zone.onDirection ) {
			const directionHandled = zone.onDirection(
				event,
				root,
				elements,
				activeIndex,
				isInside
			);

			if ( directionHandled === true ) {
				return true;
			}

			if ( directionHandled === false ) {
				return false;
			}
		}

		if ( !isInside ) {
			const firstIndex = isBackward ? elements.length - 1 : 0;
			return this._focusElement( zone, state, elements, firstIndex );
		}

		if ( zone.mode === "grid" ) {
			if ( event.key === "ArrowRight" ) {
				if ( activeIndex < elements.length - 1 ) {
					return this._focusElement(
						zone,
						state,
						elements,
						activeIndex + 1
					);
				}

				if ( activeIndex === elements.length - 1 ) {
					return this._onBoundary(
						zone,
						event,
						root,
						elements,
						activeIndex
					);
				}

				return false;
			}

			if ( event.key === "ArrowLeft" ) {
				if ( activeIndex > 0 ) {
					return this._focusElement(
						zone,
						state,
						elements,
						activeIndex - 1
					);
				}

				if ( activeIndex === 0 ) {
					return this._onBoundary(
						zone,
						event,
						root,
						elements,
						activeIndex
					);
				}

				return false;
			}

			const spatialIndex = this._findSpatialIndex(
				elements,
				activeIndex,
				event.key
			);

			if ( spatialIndex !== -1 ) {
				return this._focusElement( zone, state, elements, spatialIndex );
			}

			if ( this._onBoundary( zone, event, root, elements, activeIndex ) ) {
				return true;
			}

			return false;
		}

		const direction = isForward ? 1 : -1;
		const nextIndex = ( activeIndex + direction + elements.length ) % elements.length;

		return this._focusElement( zone, state, elements, nextIndex );
	}
});
