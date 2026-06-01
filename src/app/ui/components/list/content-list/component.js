import { A } from "@ember/array";
import Component from "@ember/component";
import { get, setProperties } from "@ember/object";
import { readOnly } from "@ember/object/computed";
import { addObserver } from "@ember/object/observers";
import { inject as service } from "@ember/service";
import layout from "./template.hbs";
import "./styles.less";


export default Component.extend({
	keyboardNavigation: service( "keyboard-navigation" ),

	layout,

	tagName: "div",
	classNames: [
		"content-list-component"
	],
	classNameBindings: [
		"float::content-list-nofloat"
	],

	content: null,
	compare: null,
	asynchronous: false,

	infiniteScroll: true,
	float: true,


	isFetching: readOnly( "_targetObject.isFetching" ),
	hasFetchedAll: readOnly( "_targetObject.hasFetchedAll" ),
	fetchError: readOnly( "_targetObject.fetchError" ),


	init() {
		this._super( ...arguments );

		setProperties( this, {
			lengthInitial: get( this, "content.length" ),
			length: 0,
			duplicates: A(),
			duplicatesMap: new Map(),
			initialFocusTimeoutId: null
		});

		addObserver( this, "content.length", this, this.checkDuplicates );
		this.checkDuplicates();
	},

	didInsertElement() {
		this._super( ...arguments );

		const zoneId = `content-list-${this.elementId}`;
		setProperties( this, { zoneId } );

		this.keyboardNavigation.registerZone({
			id: zoneId,
			element: () => this.element,
			mode: "grid",
			selector: "ul > li",
			getRingTarget: element => {
				if ( !element ) {
					return null;
				}

				const ringSelector = element.getAttribute( "data-nav-ring-selector" );
				if ( ringSelector ) {
					if ( ringSelector === ":self" ) {
						return element;
					}

					return element.querySelector( ringSelector );
				}

				return element.querySelector( "[data-nav-ring]" )
					|| element.querySelector( "a,button,[role='button']" );
			},
			onBoundary: ( event, root, elements, activeIndex ) => {
				if ( event.key === "ArrowUp" ) {
					return this.keyboardNavigation.focusAdjacentContentZone( zoneId, "up" )
						|| this.keyboardNavigation.focusZone( "search-bar-zone", "first" );
				}

				if ( event.key === "ArrowDown" ) {
					return this.keyboardNavigation.focusAdjacentContentZone( zoneId, "down" );
				}

				if ( event.key !== "ArrowLeft" || activeIndex !== 0 ) {
					return false;
				}

				return this.keyboardNavigation.focusZone( "main-menu", "first" );
			},
			onConfirm: ( event, root, elements, activeIndex ) => {
				const index = activeIndex !== -1 ? activeIndex : 0;
				const item = elements[ index ];

				if ( !item ) {
					return false;
				}

				const actionSelector = item.getAttribute( "data-nav-action-selector" );
				const actionTarget = actionSelector
					? ( actionSelector === ":self"
						? item
						: item.querySelector( actionSelector ) )
					: item.querySelector( "[data-nav-action]" );

				if ( actionTarget && actionTarget.click instanceof Function ) {
					actionTarget.click();
					return true;
				}

				if ( item.click instanceof Function ) {
					item.click();
				}

				return true;
			}
		});

		this._scheduleFirstItemFocus();
	},

	willDestroyElement() {
		if ( this.initialFocusTimeoutId ) {
			window.clearTimeout( this.initialFocusTimeoutId );
			this.set( "initialFocusTimeoutId", null );
		}

		this.keyboardNavigation.unregisterZone( this.zoneId );
		this._super( ...arguments );
	},

	_scheduleFirstItemFocus() {
		if ( !this.keyboardNavigation.isZoneFocused( "main-menu" ) ) {
			return;
		}

		if ( this.initialFocusTimeoutId ) {
			window.clearTimeout( this.initialFocusTimeoutId );
		}

		this.set( "initialFocusTimeoutId", window.setTimeout( () => {
			this.set( "initialFocusTimeoutId", null );

			if ( this.isDestroying || this.isDestroyed ) {
				return;
			}

			if ( !this.element || !this.element.isConnected ) {
				return;
			}

			if ( !this.keyboardNavigation.isZoneFocused( "main-menu" ) ) {
				return;
			}

			if ( !this.element.querySelector( "ul > li" ) ) {
				return;
			}

			this.keyboardNavigation.focusZone( this.zoneId, "first" );
		}, 800 ) );
	},


	checkDuplicates() {
		// the previous content.length
		const start = this.length;

		// map content
		const compare = get( this, "compare" );
		let content = get( this, "content" ).slice( start );
		content = compare
			? content.mapBy( compare )
			: content;

		this.length += get( content, "length" );

		if ( !get( this, "asynchronous" ) ) {
			this._checkDuplicates( content, start );

		} else {
			// wait for all potential DS.PromiseObjects to resolve first
			Promise.all( content )
				.then( content => this._checkDuplicates( content, start ) );
		}
	},

	_checkDuplicates( content, start ) {
		const duplicatesMap = this.duplicatesMap;
		const newDuplicates = content.map( item => {
			if ( !duplicatesMap.has( item ) ) {
				duplicatesMap.set( item, true );
				return false;
			} else {
				return true;
			}
		});

		// insert newDuplicates at specific position (function may have been called asynchronously)
		const length = get( content, "length" );
		this.duplicates.replace( start, length, newDuplicates );

		// tell ember to update the yielded duplicates in the template's each loop
		this.notifyPropertyChange( "duplicates" );
		this._scheduleFirstItemFocus();
	},


	actions: {
		willFetchContent( force ) {
			this.triggerAction({
				action: "willFetchContent",
				actionContext: force
			});
		}
	}

}).reopenClass({
	positionalParams: [
		"content",
		"compare",
		"asynchronous"
	]
});
