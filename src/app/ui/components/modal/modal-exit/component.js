import { inject as service } from "@ember/service";
import ModalDialogComponent from "../modal-dialog/component";
import layout from "./template.hbs";
import "./styles.less";


export default ModalDialogComponent.extend({
	nwjs: service(),
	keyboardNavigation: service( "keyboard-navigation" ),

	layout,

	classNames: [ "modal-exit-component" ],
	hotkeysDisabled: true,
	focusTimeoutId: null,

	didInsertElement() {
		this._super( ...arguments );

		this.keyboardNavigation.registerZone({
			id: "modal-exit",
			element: () => this.element,
			selector: ".modal-footer-component button",
			onDirection: ( event, root, elements, activeIndex ) => {
				if ( event.key !== "ArrowRight" && event.key !== "ArrowLeft" ) {
					return undefined;
				}

				if ( !elements.length ) {
					return false;
				}

				if ( activeIndex === -1 ) {
					return this.keyboardNavigation.focusZone( "modal-exit", "first" );
				}

				if ( event.key === "ArrowRight" ) {
					return this.keyboardNavigation.focusZone(
						"modal-exit",
						activeIndex === 0 ? "last" : "first"
					);
				}

				return this.keyboardNavigation.focusZone(
					"modal-exit",
					activeIndex === 0 ? "last" : "first"
				);
			},
			onConfirm: ( event, root, elements, activeIndex ) => {
				const index = activeIndex !== -1 ? activeIndex : 0;
				const button = elements[ index ];

				if ( !button ) {
					return false;
				}

				button.click();
				return true;
			},
			onBack: event => {
				if ( event.repeat ) {
					return true;
				}

				this.send( "cancel" );
				return true;
			}
		});

		this.focusTimeoutId = window.setTimeout(
			() => this.keyboardNavigation.focusZone( "modal-exit", "first" ),
			500
		);
	},

	willDestroyElement() {
		if ( this.focusTimeoutId ) {
			window.clearTimeout( this.focusTimeoutId );
			this.focusTimeoutId = null;
		}

		this.keyboardNavigation.unregisterZone( "modal-exit" );
		this._super( ...arguments );
	},

	actions: {
		confirm() {
			this.nwjs.quit();
		},

		cancel() {
			this.send( "close" );
		}
	}
});
