import { inject as service } from "@ember/service";
import Service from "@ember/service";


const actionUp = "up";
const actionDown = "down";
const actionLeft = "left";
const actionRight = "right";
const actionConfirm = "confirm";
const actionBack = "back";
const actionStart = "start";

const actionToKey = {
	[ actionUp ]: "ArrowUp",
	[ actionDown ]: "ArrowDown",
	[ actionLeft ]: "ArrowLeft",
	[ actionRight ]: "ArrowRight",
	[ actionConfirm ]: "Enter",
	[ actionBack ]: "Escape"
};

const buttonA = 0;
const buttonB = 1;
const buttonStart = 9;
const buttonDpadUp = 12;
const buttonDpadDown = 13;
const buttonDpadLeft = 14;
const buttonDpadRight = 15;

const stickDeadzone = 0.72;
const stickThrottle = 80;
const stickEdgeDelay = 250;
const buttonPressThreshold = 0.5;
const activityThreshold = 0.08;
const detectionInterval = 500;
const idleSleepDelay = 2500;


const createDefaultState = () => ({
	[ actionUp ]: { pressed: false, lastFire: 0, repeated: false },
	[ actionDown ]: { pressed: false, lastFire: 0, repeated: false },
	[ actionLeft ]: { pressed: false, lastFire: 0, repeated: false },
	[ actionRight ]: { pressed: false, lastFire: 0, repeated: false },
	[ actionConfirm ]: { pressed: false, lastFire: 0, repeated: false },
	[ actionBack ]: { pressed: false, lastFire: 0, repeated: false },
	[ actionStart ]: { pressed: false, lastFire: 0, repeated: false }
});


export default Service.extend({
	keyboardNavigation: service( "keyboard-navigation" ),

	rafId: null,
	detectionIntervalId: null,
	started: false,
	hasConnectedGamepad: false,
	connectedListener: null,
	disconnectedListener: null,
	blurListener: null,
	focusListener: null,
	visibilityListener: null,
	lastActivityAt: 0,
	actionState: null,

	init() {
		this._super( ...arguments );
		this.actionState = createDefaultState();
	},

	start() {
		if ( this.started ) {
			return;
		}

		this.started = true;
		this._bindEvents();
		this._syncConnectedGamepadState();
		this._startLightDetection();
	},

	stop() {
		this.started = false;
		this._unbindEvents();
		this._resetActionState();
		this._stopLoop();
		this._stopLightDetection();
		this.hasConnectedGamepad = false;
		this.lastActivityAt = 0;
	},

	_bindEvents() {
		this.connectedListener = () => {
			this.hasConnectedGamepad = true;
			this._startLightDetection();
		};

		this.disconnectedListener = () => {
			this._syncConnectedGamepadState();

			if ( this.hasConnectedGamepad ) {
				return;
			}

			this._resetActionState();
			this._stopLoop();
			this._stopLightDetection();
			this.lastActivityAt = 0;
		};

		this.blurListener = () => {
			this._resetActionState();
			this._stopLoop();
			this._stopLightDetection();
		};

		this.focusListener = () => {
			this._syncConnectedGamepadState();
			this._startLightDetection();
		};

		this.visibilityListener = () => {
			if ( !this.started ) {
				return;
			}

			if ( document.visibilityState === "hidden" ) {
				this._resetActionState();
				this._stopLoop();
				this._stopLightDetection();
				return;
			}

			this._syncConnectedGamepadState();
			this._startLightDetection();
		};

		window.addEventListener( "gamepadconnected", this.connectedListener );
		window.addEventListener( "gamepaddisconnected", this.disconnectedListener );
		window.addEventListener( "blur", this.blurListener );
		window.addEventListener( "focus", this.focusListener );
		document.addEventListener( "visibilitychange", this.visibilityListener );
	},

	_unbindEvents() {
		if ( this.connectedListener ) {
			window.removeEventListener( "gamepadconnected", this.connectedListener );
			this.connectedListener = null;
		}

		if ( this.disconnectedListener ) {
			window.removeEventListener( "gamepaddisconnected", this.disconnectedListener );
			this.disconnectedListener = null;
		}

		if ( this.blurListener ) {
			window.removeEventListener( "blur", this.blurListener );
			this.blurListener = null;
		}

		if ( this.focusListener ) {
			window.removeEventListener( "focus", this.focusListener );
			this.focusListener = null;
		}

		if ( this.visibilityListener ) {
			document.removeEventListener( "visibilitychange", this.visibilityListener );
			this.visibilityListener = null;
		}
	},

	_isFocusedAndVisible() {
		return document.visibilityState !== "hidden"
			&& ( !( document.hasFocus instanceof Function ) || document.hasFocus() );
	},

	_hasConnectedGamepad() {
		return this._getConnectedPads().length > 0;
	},

	_syncConnectedGamepadState() {
		this.hasConnectedGamepad = this._hasConnectedGamepad();
	},

	_getRawGamepads() {
		if ( typeof navigator.getGamepads !== "function" ) {
			return [];
		}

		const pads = navigator.getGamepads();

		return pads || [];
	},

	_getConnectedPads() {
		return Array.from( this._getRawGamepads() )
			.filter( gamepad => gamepad && gamepad.connected );
	},

	_getPadActivityScore( gamepad ) {
		const axisScore = gamepad.axes
			.reduce( ( max, value ) => Math.max( max, Math.abs( value || 0 ) ), 0 );
		const buttonScore = gamepad.buttons
			.reduce( ( max, button ) => Math.max( max, ( button && button.value ) || 0 ), 0 );

		return Math.max( axisScore, buttonScore );
	},

	_isButtonPressed( gamepad, index ) {
		const button = gamepad.buttons[ index ];

		if ( !button ) {
			return false;
		}

		return !!button.pressed || button.value >= buttonPressThreshold;
	},

	_getAxis( gamepad, index ) {
		return gamepad.axes[ index ] || 0;
	},

	_resetActionState() {
		this.actionState = createDefaultState();
	},

	_startLightDetection() {
		if ( !this.started || this.rafId !== null || this.detectionIntervalId !== null ) {
			return;
		}

		if ( !this.hasConnectedGamepad ) {
			return;
		}

		if ( !this._isFocusedAndVisible() ) {
			return;
		}

		this.detectionIntervalId = window.setInterval(
			() => this._detectFirstInput(),
			detectionInterval
		);

		this._detectFirstInput();
	},

	_stopLightDetection() {
		if ( this.detectionIntervalId === null ) {
			return;
		}

		window.clearInterval( this.detectionIntervalId );
		this.detectionIntervalId = null;
	},

	_detectFirstInput() {
		if ( !this.started || this.rafId !== null || !this._isFocusedAndVisible() ) {
			return;
		}

		if ( !this.hasConnectedGamepad ) {
			return;
		}

		const pads = this._getConnectedPads();

		if ( !pads.length ) {
			return;
		}

		for ( const pad of pads ) {
			if ( this._getPadActivityScore( pad ) < activityThreshold ) {
				continue;
			}

			if ( this.keyboardNavigation.markInputSource instanceof Function ) {
				this.keyboardNavigation.markInputSource( "gamepad" );
			}

			this.lastActivityAt = performance.now();
			this._stopLightDetection();
			this._startLoop();
			return;
		}
	},

	_startLoop() {
		if ( this.rafId !== null ) {
			return;
		}

		this._tick();
	},

	_stopLoop() {
		if ( this.rafId === null ) {
			return;
		}

		window.cancelAnimationFrame( this.rafId );
		this.rafId = null;
	},

	willDestroy() {
		this.stop();
		this._super( ...arguments );
	},

	_tick() {
		if ( !this.started || !this._isFocusedAndVisible() ) {
			this.rafId = null;
			return;
		}

		const now = performance.now();
		const pads = this._getConnectedPads();

		if ( pads.length ) {
			let hasActivePad = false;
			let up = false;
			let down = false;
			let left = false;
			let right = false;
			let confirm = false;
			let back = false;
			let start = false;

			for ( const pad of pads ) {
				if ( this._getPadActivityScore( pad ) < activityThreshold ) {
					continue;
				}

				hasActivePad = true;

				const axisX = this._getAxis( pad, 0 );
				const axisY = this._getAxis( pad, 1 );
				const hatAxisX = this._getAxis( pad, 6 );
				const hatAxisY = this._getAxis( pad, 7 );

				up = up
					|| this._isButtonPressed( pad, buttonDpadUp )
					|| axisY < -stickDeadzone
					|| hatAxisY < -stickDeadzone;
				down = down
					|| this._isButtonPressed( pad, buttonDpadDown )
					|| axisY > stickDeadzone
					|| hatAxisY > stickDeadzone;
				left = left
					|| this._isButtonPressed( pad, buttonDpadLeft )
					|| axisX < -stickDeadzone
					|| hatAxisX < -stickDeadzone;
				right = right
					|| this._isButtonPressed( pad, buttonDpadRight )
					|| axisX > stickDeadzone
					|| hatAxisX > stickDeadzone;

				confirm = confirm || this._isButtonPressed( pad, buttonA );
				back = back || this._isButtonPressed( pad, buttonB );
				start = start || this._isButtonPressed( pad, buttonStart );
			}

			if ( hasActivePad ) {
				this.lastActivityAt = now;

				if ( up && down ) {
					up = false;
					down = false;
				}

				if ( left && right ) {
					left = false;
					right = false;
				}

				this._processAction( actionUp, up, now, stickEdgeDelay, stickThrottle );
				this._processAction( actionDown, down, now, stickEdgeDelay, stickThrottle );
				this._processAction( actionLeft, left, now, stickEdgeDelay, stickThrottle );
				this._processAction( actionRight, right, now, stickEdgeDelay, stickThrottle );
				this._processAction( actionConfirm, confirm, now, 0, 0 );
				this._processAction( actionBack, back, now, 0, 0 );
				this._processAction( actionStart, start, now, 0, 0 );
			} else {
				this._resetActionState();
			}
		} else {
			this._resetActionState();
		}

		if ( now - this.lastActivityAt >= idleSleepDelay ) {
			this._stopLoop();
			this._startLightDetection();
			return;
		}

		this.rafId = window.requestAnimationFrame( () => this._tick() );
	},

	_processAction( action, value, now, edgeDelay, holdDelay ) {
		const state = this.actionState[ action ];

		if ( !state ) {
			return;
		}

		if ( value ) {
			if ( !state.pressed ) {
				this._dispatchAction( action );
				state.lastFire = now;
				state.pressed = true;
				state.repeated = false;
				return;
			}

			const delay = state.repeated ? holdDelay : edgeDelay;

			if ( delay > 0 && now - state.lastFire >= delay ) {
				this._dispatchAction( action );
				state.lastFire = now;
				state.repeated = true;
			}

			return;
		}

		state.pressed = false;
		state.lastFire = 0;
		state.repeated = false;
	},

	_dispatchAction( action ) {
		if ( action === actionStart ) {
			this._dispatchKey( "GamepadStart" );
			return;
		}

		const key = actionToKey[ action ];

		if ( !key ) {
			return;
		}

		this._dispatchKey( key );
	},

	_dispatchKey( key ) {
		const keyboardNavigation = this.keyboardNavigation;

		if ( !keyboardNavigation || !( keyboardNavigation.trigger instanceof Function ) ) {
			return;
		}

		if ( keyboardNavigation.markInputSource instanceof Function ) {
			keyboardNavigation.markInputSource( "gamepad" );
		}

		keyboardNavigation.trigger({
			key,
			inputSource: "gamepad",
			target: document.activeElement,
			preventDefault() {},
			stopImmediatePropagation() {}
		});
	}
});
