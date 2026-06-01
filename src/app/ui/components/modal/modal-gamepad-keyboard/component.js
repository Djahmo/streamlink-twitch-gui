import { set } from "@ember/object";
import { inject as service } from "@ember/service";
import ModalDialogComponent from "../modal-dialog/component";
import layout from "./template.hbs";
import "./styles.less";


const keyRows = [
	[ "a", "b", "c", "d", "e", "f", "g", "h", "i", "j" ],
	[ "k", "l", "m", "n", "o", "p", "q", "r", "s", "t" ],
	[ "u", "v", "w", "x", "y", "z", "0", "1", "2", "3" ],
	[ "4", "5", "6", "7", "8", "9", "-", "_" ]
];


export default ModalDialogComponent.extend({
	keyboardNavigation: service( "keyboard-navigation" ),

	layout,
	classNames: [ "modal-gamepad-keyboard-component" ],
	hotkeysDisabled: true,
	zoneId: "modal-gamepad-keyboard",
	value: "",
	keyRows,

	didInsertElement() {
		this._super( ...arguments );

		set( this, "value", this.modalContext && this.modalContext.value || "" );

		this.keyboardNavigation.registerZone({
			id: this.zoneId,
			element: () => this.element,
			selector: ".vk-key,.vk-action",
			mode: "grid",
			suppressSelectionOnEnter: false,
			onConfirm: ( event, root, elements, activeIndex ) => {
				const index = activeIndex !== -1 ? activeIndex : 0;
				const button = elements[ index ];

				if ( !button ) {
					return false;
				}

				button.click();
				return true;
			},
			onBack: () => {
				this.send( "close" );
				return true;
			},
			onStart: () => {
				this.send( "search" );
				return true;
			}
		});
	},

	willDestroyElement() {
		this.keyboardNavigation.unregisterZone( this.zoneId );
		this._super( ...arguments );
	},

	actions: {
		pressKey( key ) {
			set( this, "value", `${this.value}${key}` );
		},

		clear() {
			set( this, "value", "" );
		},

		erase() {
			if ( !this.value.length ) {
				return;
			}

			set( this, "value", this.value.slice( 0, -1 ) );
		},

		space() {
			set( this, "value", `${this.value} ` );
		},

		search() {
			if ( this.modalContext && this.modalContext.onSubmit instanceof Function ) {
				this.modalContext.onSubmit( this.value );
			}

			this.send( "close" );
		}
	}
});
