import Component from "@ember/component";
import { set, getWithDefault } from "@ember/object";
import { sort } from "@ember/object/computed";
import { on } from "@ember/object/evented";
import { run } from "@ember/runloop";
import { inject as service } from "@ember/service";
import { vars as varsConfig } from "config";
import HotkeyMixin from "ui/components/-mixins/hotkey";
import Search from "data/models/search/model";
import getStreamFromUrl from "utils/getStreamFromUrl";
import layout from "./template.hbs";
import "./styles.less";


const { "search-history-size": searchHistorySize } = varsConfig;
const { filters } = Search;


export default Component.extend( HotkeyMixin, /** @class SearchBarComponent */  {
	/** @type {RouterService} */
	router: service(),
	/** @type {DS.Store} */
	store: service(),
	modal: service(),
	keyboardNavigation: service( "keyboard-navigation" ),

	layout,
	tagName: "nav",
	classNames: [ "search-bar-component" ],

	// the record array (will be set by init())
	model: null,
	// needed by SortableMixin's arrangedContent
	content: sort( "model", "sortBy" ),
	sortBy: [ "date:desc" ],

	showDropdown: false,

	query: "",
	reQuery: /^\S+/,

	filters,
	filter: "all",


	hotkeysNamespace: "searchbar",
	hotkeys: {
		focus: "focus"
	},
	searchZoneId: "search-bar-zone",


	init() {
		this._super( ...arguments );

		this.store.findAll( "search" )
			.then( records => {
				set( this, "model", records );
			});
	},

	didInsertElement() {
		this._super( ...arguments );

		this.keyboardNavigation.registerZone({
			id: this.searchZoneId,
			element: () => this.element,
			allowEditableDirectionNavigation: true,
			selector: "input[type='search']",
			getRingTarget: () => this.element.querySelector( "input[type='search']" ),
			onDirection: event => {
				if ( event.key === "ArrowDown" ) {
					return this.keyboardNavigation.focusFirstContentZone( this.searchZoneId );
				}

				if ( event.key === "ArrowLeft" ) {
					return this.keyboardNavigation.focusZone( "main-menu", "first" );
				}

				if ( event.key === "ArrowUp" ) {
					return true;
				}

				return undefined;
			},
			onConfirm: event => {
				if ( event.inputSource === "gamepad" ) {
					this.send( "openGamepadKeyboard" );
					return true;
				}

				this.send( "focus" );
				return true;
			},
			onStart: () => {
				this.send( "openGamepadKeyboard" );
				return true;
			}
		});
	},

	willDestroyElement() {
		this.keyboardNavigation.unregisterZone( this.searchZoneId );
		this._super( ...arguments );
	},


	async addRecord( query, filter ) {
		const { /** @type {DS.RecordArray<Search>} */ model } = this;
		const match = model.find( record => query === record.query && filter === record.filter );
		const date = new Date();

		// found a matching record? just update the date property, save the record and return
		if ( match ) {
			set( match, "date", date );
			await match.save();
			return;
		}

		const id = 1 + Number( getWithDefault( model, "lastObject.id", 0 ) );

		// we don't want to store more than X records
		const { length } = model;
		/* istanbul ignore else */
		if ( length >= searchHistorySize ) {
			/** @type {Ember.MutableArray} */
			const sorted = model.sortBy( "date" );
			const start = searchHistorySize - 1;
			const num = length - start;
			const old = sorted.removeAt( start, num );
			await run( () => Promise.all(
				old.map( oldRecord => oldRecord.destroyRecord() )
			) );
		}

		// create a new record
		let record = this.store.createRecord( "search", { id, query, filter, date } );
		await record.save();
		model.addObject( record );
	},

	async deleteAllRecords() {
		// delete all records at once and then clear the record array
		const { model } = this;
		model.forEach( record => record.deleteRecord() );
		await model.save();
		model.clear();
		this.store.unloadAll( "search" );
	},

	doSearch( query, filter ) {
		set( this, "showDropdown", false );
		this.addRecord( query, filter );

		this.router.transitionTo( "search", { queryParams: { filter, query } } );
	},

	_submitQuery( query, filter ) {
		let nextQuery = query.trim();
		let nextFilter = filter;

		const stream = getStreamFromUrl( nextQuery );
		if ( stream ) {
			nextQuery = stream;
			nextFilter = "channels";
		}

		if ( this.reQuery.test( nextQuery ) ) {
			this.doSearch( nextQuery, nextFilter );
			return;
		}

		set( this, "showDropdown", false );
		this.router.transitionTo( "streams" );
	},


	_prepareDropdown: on( "didInsertElement", function() {
		// dropdown
		const { /** @type {HTMLElement} */ element } = this;
		const dropdown = element.querySelector( ".searchbar-dropdown" );
		const button = element.querySelector( ".btn-dropdown" );
		const search = element.querySelector( "input[type='search']" );

		search.addEventListener( "focus", ({ target }) => target.select() );

		element.ownerDocument.body.addEventListener( "click", ({ target }) => {
			// ignore clicks on the input, the dropdown button and on the dropdown itself
			if (
				   this.showDropdown
				&& !search.contains( target )
				&& !button.contains( target )
				&& !dropdown.contains( target )
			) {
				set( this, "showDropdown", false );
			}
		});
	}),


	actions: {
		back() {
			this.router.history( -1 );
		},

		forward() {
			this.router.history( +1 );
		},

		refresh() {
			this.router.refresh();
		},

		focus() {
			this.element.querySelector( "input[type='search']" ).focus();
		},

		toggleDropdown() {
			set( this, "showDropdown", !this.showDropdown );
		},

		clear() {
			set( this, "query", "" );
		},

		submit() {
			this._submitQuery( this.query, this.filter );
		},

		openGamepadKeyboard() {
			const currentFilter = this.filter;
			const currentQuery = this.query;

			this.modal.openModal( "gamepad-keyboard", {
				value: currentQuery,
				filter: currentFilter,
				onSubmit: value => {
					set( this, "query", value );
					this._submitQuery( value, currentFilter );
				}
			});
		},

		searchHistory({ query, filter }) {
			this.doSearch( query, filter );
		},

		clearHistory() {
			this.deleteAllRecords();
		}
	}
});
