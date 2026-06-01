import { get } from "@ember/object";
import { addObserver } from "@ember/object/observers";
import { enable as enableSmoothScroll, disable as disableSmoothScroll } from "smoothscroll";


export default {
	name: "application",
	before: "nwjs",

	initialize( application ) {
		const document = application.lookup( "service:-document" );
		const RouterService = application.lookup( "service:router" );
		const SettingsService = application.lookup( "service:settings" );
		const HotkeyService = application.lookup( "service:hotkey" );
		const NwjsService = application.lookup( "service:nwjs" );
		const KeyboardNavigationService = application.lookup( "service:keyboard-navigation" );
		const GamepadNavigationService = application.lookup( "service:gamepad-navigation" );
		const AccessibilityOverlayService = application.lookup( "service:accessibility-overlay" );
		const rootElement = document.querySelector( application.rootElement );

		if ( GamepadNavigationService && GamepadNavigationService.start instanceof Function ) {
			GamepadNavigationService.start();
		}

		if (
			AccessibilityOverlayService
			&& AccessibilityOverlayService.start instanceof Function
		) {
			AccessibilityOverlayService.start();
		}

		addObserver( SettingsService, "gui.smoothscroll", SettingsService, function() {
			if ( get( this, "gui.smoothscroll" ) ) {
				enableSmoothScroll();
			} else {
				disableSmoothScroll();
			}
		});

		addObserver( SettingsService, "gui.fullscreen", SettingsService, function() {
			NwjsService.fullscreen( get( this, "gui.fullscreen" ) );
		});

		if ( SettingsService && SettingsService.on instanceof Function ) {
			SettingsService.on( "initialized", () => {
				NwjsService.fullscreen( get( SettingsService, "gui.fullscreen" ) );
			});
		}

		function history( e, go ) {
			e.preventDefault();
			e.stopImmediatePropagation();
			RouterService.history( go );
		}
		rootElement.addEventListener( "mouseup", e => {
			if ( e.buttons & 0b01000 ) {
				return history( e, -1 );
			}
			if ( e.buttons & 0b10000 ) {
				return history( e, +1 );
			}
		});

		const reHotkeyIgnoreTags = /^(INPUT|TEXTAREA)$/;
		rootElement.addEventListener( "keyup", e => {
			if ( !reHotkeyIgnoreTags.test( e.target.nodeName ) ) {
				HotkeyService.trigger( e );
			}
		});

		rootElement.addEventListener( "keydown", e => {
			if (
				KeyboardNavigationService
				&& KeyboardNavigationService.trigger instanceof Function
			) {
				KeyboardNavigationService.trigger( e );
			}
		});

		const events = "dragstart dragover dragend dragenter dragleave dragexit drag drop";
		const disableDrag = e => {
			e.preventDefault();
			e.stopImmediatePropagation();
		};
		for ( const e of events.split( " " ) ) {
			rootElement.addEventListener( e, disableDrag );
		}
	}
};
