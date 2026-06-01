import Component from "@ember/component";
import { inject as service } from "@ember/service";
import HotkeyMixin from "ui/components/-mixins/hotkey";
import layout from "./template.hbs";
import "./styles.less";


const hotkeyActionRouteMap = {
	"routeAbout": "about",
	"routeWatching": "watching",
	"routeUserAuth": "user.auth",
	"routeSettings": "settings",
	"routeGames": "games",
	"routeStreams": "streams",
	"routeUserFollowedStreams": "user.followedStreams",
	"routeUserFollowedChannels": "user.followedChannels"
};


export default Component.extend( HotkeyMixin, /** @class MainMenuComponent */ {
	/** @type {RouterService} */
	router: service(),
	modal: service(),
	keyboardNavigation: service( "keyboard-navigation" ),

	layout,

	classNames: [ "main-menu-component" ],
	tagName: "aside",

	hotkeysNamespace: "navigation",
	hotkeys: {
		/** @this {MainMenuComponent} */
		refresh() {
			this.router.refresh();
		},
		/** @this {MainMenuComponent} */
		historyBack() {
			this.router.history( -1 );
		},
		/** @this {MainMenuComponent} */
		historyForward() {
			this.router.history( +1 );
		},
		/** @this {MainMenuComponent} */
		homepage() {
			this.router.homepage();
		},
		...Object.entries( hotkeyActionRouteMap )
			.reduce( ( obj, [ action, route ]) => Object.assign( obj, {
				/** @this {MainMenuComponent} */
				[ action ]() {
					this.router.transitionTo( route );
				}
			}), {} )
	},

	didInsertElement() {
		this._super( ...arguments );
		this.keyboardNavigation.registerZone({
			id: "main-menu",
			element: () => this.element && this.element.querySelector( "nav" ),
			selector: "a",
			onBack: event => {
				if ( event.key !== "Escape" ) {
					return false;
				}

				if ( event.repeat ) {
					return true;
				}

				if ( !this.modal.hasModal( "exit" ) ) {
					this.modal.openModal( "exit" );
				}

				return true;
			},
			onDirection: event => {
				if ( event.key !== "ArrowRight" ) {
					return undefined;
				}

				return this.keyboardNavigation.focusFirstContentZone();
			}
		});
	},

	willDestroyElement() {
		this.keyboardNavigation.unregisterZone( "main-menu" );
		this._super( ...arguments );
	}
});
