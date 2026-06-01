import Service, { inject as service } from "@ember/service";


const fallbackLabels = [
	{
		selector: ".title-bar-component .logo",
		key: "services.accessibility.overlay.labels.open-homepage"
	},
	{
		selector: ".title-bar-component .btn-settings",
		key: "services.accessibility.overlay.labels.open-settings"
	},
	{
		selector: ".title-bar-component .btn-reload",
		key: "services.accessibility.overlay.labels.reload-application"
	},
	{
		selector: ".title-bar-component .btn-devtools",
		key: "services.accessibility.overlay.labels.open-developer-tools"
	},
	{
		selector: ".title-bar-component .btn-min",
		key: "services.accessibility.overlay.labels.minimize-window"
	},
	{
		selector: ".title-bar-component .btn-max",
		key: "services.accessibility.overlay.labels.maximize-window"
	},
	{
		selector: ".title-bar-component .btn-close",
		key: "services.accessibility.overlay.labels.close-window"
	},
	{
		selector: ".title-bar-component .btn-watching",
		key: "services.accessibility.overlay.labels.open-watching"
	},
	{
		selector: ".search-bar-component .btn-nav.fa-chevron-left",
		key: "services.accessibility.overlay.labels.go-back"
	},
	{
		selector: ".search-bar-component .btn-nav.fa-chevron-right",
		key: "services.accessibility.overlay.labels.go-forward"
	},
	{
		selector: ".search-bar-component .btn-nav.fa-refresh",
		key: "services.accessibility.overlay.labels.refresh"
	},
	{
		selector: ".search-bar-component .btn-context-valid.fa-times",
		key: "services.accessibility.overlay.labels.clear-search"
	},
	{
		selector: ".search-bar-component .btn-context-valid.fa-search",
		key: "services.accessibility.overlay.labels.search"
	},
	{
		selector: ".search-bar-component .btn-dropdown",
		key: "services.accessibility.overlay.labels.toggle-search-options"
	},
	{
		selector: ".search-bar-component .clear",
		key: "services.accessibility.overlay.labels.clear-search-history"
	},
	{
		selector: ".stream-item-component .btn-expand",
		key: "services.accessibility.overlay.labels.toggle-stream-details"
	},
	{
		selector: ".form-file-select-component .btn.fa-search",
		key: "services.accessibility.overlay.labels.browse-file"
	}
];

const iconLabelMap = [
	{ icon: "fa-chevron-left", key: "services.accessibility.overlay.labels.go-back" },
	{ icon: "fa-chevron-right", key: "services.accessibility.overlay.labels.go-forward" },
	{ icon: "fa-refresh", key: "services.accessibility.overlay.labels.refresh" },
	{ icon: "fa-search", key: "services.accessibility.overlay.labels.search" },
	{ icon: "fa-times", key: "services.accessibility.overlay.labels.close" },
	{ icon: "fa-cog", key: "services.accessibility.overlay.labels.open-settings" },
	{ icon: "fa-user", key: "services.accessibility.overlay.labels.open-user" },
	{ icon: "fa-desktop", key: "services.accessibility.overlay.labels.open-watching" },
	{ icon: "fa-minus", key: "services.accessibility.overlay.labels.minimize-window" },
	{ icon: "fa-plus", key: "services.accessibility.overlay.labels.maximize-window" },
	{ icon: "fa-code", key: "services.accessibility.overlay.labels.open-developer-tools" },
	{ icon: "fa-trash-o", key: "services.accessibility.overlay.labels.delete" },
	{ icon: "fa-pencil", key: "services.accessibility.overlay.labels.edit" },
	{ icon: "fa-play", key: "services.accessibility.overlay.labels.play" },
	{ icon: "fa-download", key: "services.accessibility.overlay.labels.download" },
	{ icon: "fa-check", key: "services.accessibility.overlay.labels.confirm" }
];

const setAttrIfMissing = ( element, name, value ) => {
	if ( !element || !value || element.hasAttribute( name ) ) {
		return;
	}

	element.setAttribute( name, value );
};

const setButtonSemantics = ( element ) => {
	if ( !element ) {
		return;
	}

	if ( element.matches( "button,a,input,select,textarea" ) ) {
		return;
	}

	setAttrIfMissing( element, "role", "button" );
	if ( element.tabIndex < 0 ) {
		element.setAttribute( "tabindex", "0" );
	}
	element.setAttribute( "data-a11y-overlay-button", "true" );
};

const normalizeLabel = ( element ) => {
	if ( !element || element.hasAttribute( "aria-label" ) ) {
		return;
	}

	const title = element.getAttribute( "title" );
	const text = ( element.textContent || "" ).replace( /\s+/g, " " ).trim();
	const label = title || text;

	if ( label ) {
		element.setAttribute( "aria-label", label );
	}
};

const readText = ( element, selector ) => {
	if ( !element ) {
		return "";
	}

	const target = element.querySelector( selector );
	if ( !target ) {
		return "";
	}

	return ( target.textContent || "" ).replace( /\s+/g, " " ).trim();
};

const normalizeText = text => ( text || "" ).replace( /\s+/g, " " ).trim();

const hasMeaningfulText = text => {
	if ( !text ) {
		return false;
	}

	return /[^\d\s]/.test( text );
};

const getLabelFromIcon = ( element, translate ) => {
	if ( !element || !element.classList ) {
		return "";
	}

	for ( const entry of iconLabelMap ) {
		if ( element.classList.contains( entry.icon ) ) {
			return translate( entry.key );
		}

		if ( element.querySelector( `.${entry.icon}` ) ) {
			return translate( entry.key );
		}
	}

	return "";
};

const getStreamTitle = item => {
	const infoTitle = normalizeText( readText(
		item,
		"section .bottom .info-title span"
	) );
	if ( infoTitle ) {
		return infoTitle;
	}

	const statusTitle = normalizeText( readText(
		item,
		"section .details .status .embedded-links-component"
	) );
	if ( statusTitle ) {
		return statusTitle;
	}

	return "";
};

export default Service.extend({
	intl: service(),

	started: false,
	observer: null,
	listenerKeydown: null,
	listenerVisibilityChange: null,
	listenerWindowFocus: null,
	listenerWindowBlur: null,
	refreshRafId: null,

	_t( key ) {
		if ( !this.intl || !( this.intl.t instanceof Function ) ) {
			return key;
		}

		return this.intl.t( key ).toString();
	},

	start() {
		if ( this.started || !document || !document.body ) {
			return;
		}

		this.started = true;
		this._bindKeydown();
		this._bindVisibilityChange();
		this._bindWindowFocusChange();
		this._bindMutations();
		this.refresh();
	},

	stop() {
		if ( !this.started ) {
			return;
		}

		this.started = false;

		if ( this.listenerKeydown ) {
			document.removeEventListener( "keydown", this.listenerKeydown, true );
			this.listenerKeydown = null;
		}

		if ( this.listenerVisibilityChange ) {
			document.removeEventListener( "visibilitychange", this.listenerVisibilityChange );
			this.listenerVisibilityChange = null;
		}

		if ( this.listenerWindowFocus ) {
			window.removeEventListener( "focus", this.listenerWindowFocus );
			this.listenerWindowFocus = null;
		}

		if ( this.listenerWindowBlur ) {
			window.removeEventListener( "blur", this.listenerWindowBlur );
			this.listenerWindowBlur = null;
		}

		if ( this.observer ) {
			this.observer.disconnect();
			this.observer = null;
		}

		if ( this.refreshRafId !== null ) {
			window.cancelAnimationFrame( this.refreshRafId );
			this.refreshRafId = null;
		}
	},

	willDestroy() {
		this.stop();
		this._super( ...arguments );
	},

	_bindKeydown() {
		this.listenerKeydown = event => {
			const { key, target } = event;
			if ( !target || !( target instanceof HTMLElement ) ) {
				return;
			}

			if ( target.getAttribute( "data-a11y-overlay-button" ) !== "true" ) {
				return;
			}

			if ( key !== "Enter" && key !== " " ) {
				return;
			}

			event.preventDefault();
			event.stopImmediatePropagation();
			target.click();
		};

		document.addEventListener( "keydown", this.listenerKeydown, true );
	},

	_bindMutations() {
		if ( !window.MutationObserver ) {
			return;
		}

		this.observer = new MutationObserver( () => this._scheduleRefresh() );
		this.observer.observe( document.body, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
			attributeFilter: [ "class", "title", "hidden", "disabled" ]
		} );
	},

	_bindVisibilityChange() {
		this.listenerVisibilityChange = () => {
			if ( !this.started ) {
				return;
			}

			if ( !this._isDocumentActive() ) {
				if ( this.refreshRafId !== null ) {
					window.cancelAnimationFrame( this.refreshRafId );
					this.refreshRafId = null;
				}
				return;
			}

			this._scheduleRefresh();
		};

		document.addEventListener( "visibilitychange", this.listenerVisibilityChange );
	},

	_bindWindowFocusChange() {
		this.listenerWindowFocus = () => this._scheduleRefresh();
		this.listenerWindowBlur = () => {
			if ( this.refreshRafId !== null ) {
				window.cancelAnimationFrame( this.refreshRafId );
				this.refreshRafId = null;
			}
		};

		window.addEventListener( "focus", this.listenerWindowFocus );
		window.addEventListener( "blur", this.listenerWindowBlur );
	},

	_isDocumentActive() {
		return document.visibilityState !== "hidden"
			&& ( !( document.hasFocus instanceof Function ) || document.hasFocus() );
	},

	_scheduleRefresh() {
		if (
			this.refreshRafId !== null
			|| !this.started
			|| !this._isDocumentActive()
		) {
			return;
		}

		this.refreshRafId = window.requestAnimationFrame( () => {
			this.refreshRafId = null;
			this.refresh();
		} );
	},

	refresh() {
		if (
			!this.started
			|| !document
			|| !document.body
			|| !this._isDocumentActive()
		) {
			return;
		}

		this._applyFallbackLabels();
		this._applyNavigationLabels();
		this._applyDenseLabels();
		this._applyInteractiveSemantics();
		this._applySearchDropdownState();
		this._applyStreamDetailsState();
		this._applyContentLabels();
		this._applyModalSemantics();
		this._applyImageAlt();
		this._hideDecorativeIcons();
	},

	_applyFallbackLabels() {
		for ( const entry of fallbackLabels ) {
			const element = document.querySelector( entry.selector );
			if ( !element ) {
				continue;
			}

			if (
				entry.selector.indexOf( " .logo" ) !== -1
				|| entry.selector.indexOf( " .clear" ) !== -1
				|| entry.selector.indexOf( " .btn-expand" ) !== -1
			) {
				setButtonSemantics( element );
			}

			setAttrIfMissing( element, "aria-label", this._t( entry.key ) );
		}

		document
			.querySelectorAll(
				".title-bar-component button,"
				+ ".search-bar-component button,"
				+ ".form-file-select-component button"
			)
			.forEach( normalizeLabel );
	},

	_applyNavigationLabels() {
		const mainMenu = document.querySelector( ".main-menu-component nav" );
		if ( mainMenu ) {
			setAttrIfMissing(
				mainMenu,
				"aria-label",
				this._t( "services.accessibility.overlay.labels.main-menu" )
			);
		}

		const titleMain = document.querySelector( ".title-bar-component .buttons-main" );
		if ( titleMain ) {
			setAttrIfMissing(
				titleMain,
				"aria-label",
				this._t( "services.accessibility.overlay.labels.primary-actions" )
			);
		}

		const titleDebug = document.querySelector( ".title-bar-component .buttons-debug" );
		if ( titleDebug ) {
			setAttrIfMissing(
				titleDebug,
				"aria-label",
				this._t( "services.accessibility.overlay.labels.debug-actions" )
			);
		}

		const titleWindow = document.querySelector( ".title-bar-component .buttons-window" );
		if ( titleWindow ) {
			setAttrIfMissing(
				titleWindow,
				"aria-label",
				this._t( "services.accessibility.overlay.labels.window-controls" )
			);
		}

		const searchNav = document.querySelector( ".search-bar-component" );
		if ( searchNav ) {
			setAttrIfMissing(
				searchNav,
				"aria-label",
				this._t( "services.accessibility.overlay.labels.search-navigation" )
			);
		}

		const subMenus = document.querySelectorAll( ".sub-menu-component" );
		subMenus.forEach( menu => setAttrIfMissing(
			menu,
			"aria-label",
			this._t( "services.accessibility.overlay.labels.sub-menu" )
		) );

		document
			.querySelectorAll( ".main-menu-component nav a,.sub-menu-component a" )
			.forEach( normalizeLabel );

		document
			.querySelectorAll( ".sub-menu-component > li" )
			.forEach( item => {
				setButtonSemantics( item );
				normalizeLabel( item );
			} );

		document
			.querySelectorAll( ".title-bar-component nav button" )
			.forEach( normalizeLabel );

		document
			.querySelectorAll( ".search-bar-component button" )
			.forEach( normalizeLabel );
	},

	_applyDenseLabels() {
		document
			.querySelectorAll( "button,a,[role='button'],[data-ember-action]" )
			.forEach( element => {
				if ( element.hasAttribute( "aria-label" ) ) {
					return;
				}

				const title = normalizeText( element.getAttribute( "title" ) || "" );
				if ( title ) {
					element.setAttribute( "aria-label", title );
					return;
				}

				const text = normalizeText( element.textContent || "" );
				if ( hasMeaningfulText( text ) ) {
					element.setAttribute( "aria-label", text );
					return;
				}

				const iconLabel = getLabelFromIcon( element, key => this._t( key ) );
				if ( iconLabel ) {
					element.setAttribute( "aria-label", iconLabel );
					return;
				}

				if ( element.closest( "nav,.main-menu-component,.sub-menu-component" ) ) {
					element.setAttribute(
						"aria-label",
						this._t( "services.accessibility.overlay.labels.navigation-item" )
					);
				}
			} );
	},

	_applyInteractiveSemantics() {
		document
			.querySelectorAll(
				".search-bar-component .clear,"
				+ ".search-bar-component .recent li,"
				+ ".stream-item-component .btn-expand,"
				+ ".title-bar-component .logo"
			)
			.forEach( element => {
				setButtonSemantics( element );
				normalizeLabel( element );
			} );
	},

	_applySearchDropdownState() {
		const root = document.querySelector( ".search-bar-component" );
		if ( !root ) {
			return;
		}

		const button = root.querySelector( ".btn-dropdown" );
		const dropdown = root.querySelector( ".searchbar-dropdown" );
		if ( !button || !dropdown ) {
			return;
		}

		const dropdownId = `${button.id || "search-dropdown-toggle"}-panel`;
		if ( !dropdown.id ) {
			dropdown.id = dropdownId;
		}

		setAttrIfMissing( button, "aria-haspopup", "true" );
		button.setAttribute( "aria-controls", dropdown.id );
		button.setAttribute(
			"aria-expanded",
			dropdown.classList.contains( "hidden" ) ? "false" : "true"
		);
	},

	_applyStreamDetailsState() {
		document.querySelectorAll( ".stream-item-component" ).forEach( streamItem => {
			const toggle = streamItem.querySelector( ".btn-expand" );
			if ( !toggle ) {
				return;
			}

			setButtonSemantics( toggle );
			normalizeLabel( toggle );

			const expanded = streamItem.querySelector( "section.expanded" ) !== null;
			toggle.setAttribute( "aria-expanded", expanded ? "true" : "false" );
		} );
	},

	_applyContentLabels() {
		document.querySelectorAll( ".game-item-component" ).forEach( item => {
			const gameName = readText( item, "header" );
			if ( gameName ) {
				item.setAttribute( "aria-label", gameName );

				const preview = item.querySelector( "div" );
				if ( preview ) {
					preview.setAttribute( "aria-label", gameName );
				}

				const image = item.querySelector( ".previewImage" );
				if ( image ) {
					image.setAttribute( "alt", gameName );
				}
			}
		} );

		document.querySelectorAll( ".stream-item-component" ).forEach( item => {
			const channelName = normalizeText( readText( item, "header span a,header span" ) );
			const streamTitle = getStreamTitle( item );
			const safeStreamTitle = streamTitle !== channelName
				? streamTitle
				: "";
			const streamLabel = channelName && safeStreamTitle
				? `${channelName} - ${safeStreamTitle}`
				: "";
			const itemLabel = streamLabel || channelName;

			if ( itemLabel ) {
				item.setAttribute( "aria-label", itemLabel );

				const preview = item.querySelector( "section.preview" );
				if ( preview ) {
					if ( streamLabel ) {
						preview.setAttribute( "aria-label", streamLabel );
					} else {
						preview.removeAttribute( "aria-label" );
					}
				}

				const image = item.querySelector( "section.preview .previewImage" );
				if ( image ) {
					image.setAttribute( "alt", streamLabel || "" );
				}
			}
		} );

		document
			.querySelectorAll(
				".channel-item-component,.settings-channel-item-component"
			)
			.forEach( item => {
				const channelName = readText( item, "header span a,header span" );
				if ( channelName ) {
					item.setAttribute( "aria-label", channelName );
				}
			} );
	},

	_applyModalSemantics() {
		document.querySelectorAll( ".modal-dialog-component" ).forEach( dialog => {
			setAttrIfMissing( dialog, "role", "dialog" );
			setAttrIfMissing( dialog, "aria-modal", "true" );
		} );
	},

	_applyImageAlt() {
		document
			.querySelectorAll( ".preview-image-component img,.previewImage" )
			.forEach( image => {
				if ( image.hasAttribute( "alt" ) ) {
					return;
				}

				const title = image.getAttribute( "title" );
				image.setAttribute( "alt", title || "" );
			} );
	},

	_hideDecorativeIcons() {
		document.querySelectorAll( "i.fa" ).forEach( icon => {
			if ( icon.closest( "button" ) || icon.closest( "a" ) ) {
				icon.setAttribute( "aria-hidden", "true" );
				return;
			}

			if (
				icon.nextElementSibling
				|| (
					icon.parentElement
					&& icon.parentElement.textContent.trim().length > 0
				)
			) {
				icon.setAttribute( "aria-hidden", "true" );
			}
		} );
	}
});
