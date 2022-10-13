import {UtilLibWrapper} from "./PatcherLibWrapper.js";
import {Config} from "./Config.js";

class Patcher_CanvasAnimation {
	static init () {
		UtilLibWrapper.addPatch(
			"Token.prototype.setPosition",
			this._lw_Token_prototype_setPosition,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
		);

		UtilLibWrapper.addPatch(
			"Ruler.prototype._getMovementToken",
			this._lw_Ruler_prototype__getMovementToken,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
		);
	}

	static _lw_Token_prototype_setPosition (fn, x, y, opts, ...otherArgs) {
		if (
			Config.get("tokens", "isFastAnimations")
			&& (
				!Config.get("tokens", "isDisableFastAnimationsForWaypointMovement")
				|| !Patcher_CanvasAnimation._isTokenMovingAlongRuler(this)
			)
		) {
			opts = opts || {};
			opts.animate = false;
		}
		return fn(x, y, opts, ...otherArgs);
	}

	static _lw_Ruler_prototype__getMovementToken (fn) {
		const out = fn();
		this._plut_tokenLastMoving = out;
		return out;
	}

	static _isTokenMovingAlongRuler (token) {
		return canvas.controls.rulers.children.some(it => it._state === Ruler.STATES.MOVING && it._plut_tokenLastMoving === token);
	}
}

export {Patcher_CanvasAnimation};
