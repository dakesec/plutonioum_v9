import {UtilLibWrapper} from "./PatcherLibWrapper.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {Config} from "./Config.js";
import {LGT} from "./Util.js";
import {ConfigConsts} from "./ConfigConsts.js";
import {UtilCompat} from "./UtilCompat.js";
import {UtilGameSettings} from "./UtilGameSettings.js";

class Patcher_Token {
	static _lw_Token_prototype_refresh (fn, ...args) {
		const out = fn(...args);
		Patcher_Token._handleConfigUpdate_displayDamageDealt_doUpdateDisplay(this);
		return out;
	}

	static _lw_Token_prototype__onUpdate (fn, ...args) {
		const out = fn(...args);
		Patcher_Token._handleConfigUpdate_displayDamageDealt_doUpdateDisplay(this);
		return out;
	}

	static _lw_TokenDocument_prototype__onUpdateTokenActor (fn, ...args) {
		const out = fn(...args);
		Patcher_Token._handleConfigUpdate_displayDamageDealt_doUpdateDisplay(this.object);
		return out;
	}

	static _lw_TokenDocument_prototype__onUpdateBaseActor (fn, ...args) {
		const out = fn(...args);
		Patcher_Token._handleConfigUpdate_displayDamageDealt_doUpdateDisplay(this.object);
		return out;
	}

	static _lw_Token_prototype__getTextStyle (fn, ...args) {
		const out = fn(...args);

		const fontSizeMult = Config.get("tokens", "nameplateFontSizeMultiplier");
		if (fontSizeMult != null) {
			if (out.fontSize != null) out.fontSize *= fontSizeMult;
		}

		const isAllowWrap = Config.get("tokens", "isAllowNameplateFontWrap");
		if (isAllowWrap !== ConfigConsts.C_USE_GAME_DEFAULT) {
			out.wordWrap = !!isAllowWrap;
		}

		const fontWrapWidthMult = Config.get("tokens", "nameplateFontWrapWidthMultiplier");
		if (fontWrapWidthMult != null) {
			if (out.wordWrapWidth != null) out.wordWrapWidth *= fontWrapWidthMult;
		}

		return out;
	}

	static handleConfigUpdate ({isInit = false, current, previous} = {}) {
		const tokens = MiscUtil.get(canvas, "tokens", "placeables") || [];

		this._handleConfigUpdate_displayDamageDealt({isInit, tokens});
		this._handleConfigUpdate_togglePatches();

		// Avoid doing a draw unless we've had a relevant config update
		if (!this._handleConfigUpdate_isDoDraw({isInit, current, previous})) return;

		this._handleConfigUpdate_doDraw({tokens});
	}

	static _handleConfigUpdate_togglePatches () {
		// region "Damage dealt" display
		UtilLibWrapper.togglePatch(
			"Token.prototype.refresh",
			this._lw_Token_prototype_refresh,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
			Config.get("tokens", "isDisplayDamageDealt"),
		);

		UtilLibWrapper.togglePatch(
			"Token.prototype._onUpdate",
			this._lw_Token_prototype__onUpdate,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
			Config.get("tokens", "isDisplayDamageDealt"),
		);

		UtilLibWrapper.togglePatch(
			"TokenDocument.prototype._onUpdateTokenActor",
			this._lw_TokenDocument_prototype__onUpdateTokenActor,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
			Config.get("tokens", "isDisplayDamageDealt"),
		);

		UtilLibWrapper.togglePatch(
			"TokenDocument.prototype._onUpdateBaseActor",
			this._lw_TokenDocument_prototype__onUpdateBaseActor,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
			Config.get("tokens", "isDisplayDamageDealt"),
		);
		// endregion

		// region Nameplate text size
		UtilLibWrapper.togglePatch(
			"Token.prototype._getTextStyle",
			this._lw_Token_prototype__getTextStyle,
			UtilLibWrapper.LIBWRAPPER_MODE_WRAPPER,
			[
				Config.get("tokens", "nameplateFontSizeMultiplier"),
				Config.get("tokens", "isAllowNameplateFontWrap"),
				Config.get("tokens", "nameplateFontWrapWidthMultiplier"),
			].some(it => it != null),
		);
		// endregion
	}

	static _isForceDisabled (token) {
		if (
			UtilCompat.isMonksLittleDetailsActive()
			&& UtilGameSettings.getSafe(UtilCompat.MODULE_MONKS_LITTLE_DETAILS, "show-bloodsplat")
			&& UtilCompat.MonksLittleDetails.isDefeated(token)
		) return true;
		return false;
	}

	static _handleConfigUpdate_isDoDraw ({isInit, current, previous}) {
		if (isInit) return true;
		if (!current || !previous) return false;

		const diffProps = [
			"isDisplayDamageDealt",
			"damageDealtBloodiedThreshold",
			"isDamageDealtBelowToken",

			"nameplateFontSizeMultiplier",
			"isAllowNameplateFontWrap",
			"nameplateFontWrapWidthMultiplier",
		];
		return diffProps.some(prop => MiscUtil.get(current, "tokens", prop) !== MiscUtil.get(previous, "tokens", prop));
	}

	static _handleConfigUpdate_doDraw ({tokens}) {
		for (const token of tokens) {
			try {
				const visible = token.visible;
				this._pDoTokenFakeDraw({token});
				token.visible = visible;
			} catch (e) {
				// Sanity check/should never occur
				console.warn(...LGT, `Failed to refresh token "${token.id}"!`, e);
			}
		}
	}

	/**
	 * A stripped-down version of `Token.draw`, which allows us to change font parameters.
	 * We do this to avoid messing with modules like Token Magic FX, who's filters get stripped as part of `.draw()`.
	 */
	static async _pDoTokenFakeDraw ({token}) {
		// region Redraw HUD elements
		// This is effectively `_drawHUD` but without the "remove all" line, as removing the HUD kills our display
		//   (and a variety of HUD elements from other modules, such as the height display from Token Height!).
		if (!token.hud.parent) canvas.controls.hud.addChild(token.hud);

		token.hud.removeChild(token.hud.bars).destroy();
		token.hud.removeChild(token.hud.tooltip).destroy();
		token.hud.removeChild(token.hud.effects).destroy();
		token.hud.removeChild(token.hud.target).destroy();
		token.hud.removeChild(token.hud.nameplate).destroy();

		token.hud.bars = token.hud.addChild(token._drawAttributeBars());
		token.hud.tooltip = token.hud.addChild(token._drawTooltip());
		token.hud.effects = token.hud.addChild(new PIXI.Container());
		token.hud.target = token.hud.addChild(new PIXI.Graphics());
		token.hud.nameplate = token.hud.addChild(token._drawNameplate());
		// endregion

		token.refresh();

		// Ensure bars/effects are rendered appropriately
		await token.drawEffects();
		token.drawBars();
	}

	static _handleConfigUpdate_displayDamageDealt ({isInit = false, tokens} = {}) {
		try {
			return this._handleConfigUpdate_displayDamageDealt_({tokens});
		} catch (e) {
			if (!isInit) throw e;
			Config.handleFailedInitConfigApplication("tokens", "isDisplayDamageDealt", e);
		}
	}

	static _handleConfigUpdate_displayDamageDealt_ ({tokens}) {
		this._handleConfigUpdate_displayDamageDealt_doRefreshTokens({
			tokens,
			isRemoveDisplays: !Config.get("tokens", "isDisplayDamageDealt"),
		});
	}

	/**
	 * @param [opts]
	 * @param [opts.tokens]
	 * @param [opts.isRemoveDisplays] If the custom displays should be removed.
	 */
	static _handleConfigUpdate_displayDamageDealt_doRefreshTokens ({tokens, isRemoveDisplays}) {
		for (const token of tokens) {
			try {
				if (isRemoveDisplays) Patcher_Token._doRemove(token);
			} catch (e) {
				// Should never occur
			}
		}
	}

	static _doRemove (token) {
		if (!token.hud?.plut_dispDamageDealt) return;
		this._doDestroyText(token.removeChild(token.hud?.plut_dispDamageDealt));
		delete token.hud.plut_dispDamageDealt;
	}

	static _handleConfigUpdate_displayDamageDealt_doUpdateDisplay (token) {
		if (!token?.hud) return; // Should never occur

		try {
			if (this._isForceDisabled(token)) {
				Patcher_Token._doRemove(token);
				return;
			}

			this._handleConfigUpdate_displayDamageDealt_doAddDisplay(token);

			const maxHp = MiscUtil.get(token.actor, "data", "data", "attributes", "hp", "max") || 0;
			const curHp = MiscUtil.get(token.actor, "data", "data", "attributes", "hp", "value") || 0;

			const damageDealt = Math.min(maxHp, Math.max(0, maxHp - curHp));
			token.hud.plut_dispDamageDealt.text = `-${damageDealt}`;

			token.hud.plut_dispDamageDealt.visible = !!damageDealt;

			const fontSizeMult = Config.get("tokens", "nameplateFontSizeMultiplier");

			// If we are using levels, render the text below the token. This is to allow levels to work its token-clobbering
			//   magic without leaving our text underneath the token. We do this instead of patching levels, as patching levels
			//   would require constant maintenance.
			if (Config.get("tokens", "isDamageDealtBelowToken")) {
				token.hud.plut_dispDamageDealt.style.fontSize = 18 * (fontSizeMult ?? 1);

				token.hud.plut_dispDamageDealt.anchor.set(0.5, 0);

				token.hud.plut_dispDamageDealt.position.set(Math.round(token.w / 2), token.h + 1);
			} else {
				token.hud.plut_dispDamageDealt.style.fontSize = 24 * (fontSizeMult ?? 1);

				// Anchor text to the bottom-right of the nameplate
				token.hud.plut_dispDamageDealt.anchor.set(1, 1);

				// Taken from `Token._drawBar`
				const barHeight = Math.max((canvas.dimensions.size / 12), 8) * (token.data.height >= 2 ? 1.6 : 1);

				// Set position at bottom-right of token (with small offsets)
				token.hud.plut_dispDamageDealt.position.set(token.w - 3, token.h - barHeight);
			}

			if (curHp <= Math.floor(maxHp * Config.get("tokens", "damageDealtBloodiedThreshold"))) token.hud.plut_dispDamageDealt.style.fill = 0xFF0000;
			else token.hud.plut_dispDamageDealt.style.fill = 0xFFFFFF;
		} catch (e) {
			// Sanity check/should never occur
			console.warn(...LGT, `Failed to update "damage dealt" display for token "${token.id}"!`, e);
		}
	}

	static _handleConfigUpdate_displayDamageDealt_doAddDisplay (token) {
		if (
			token.hud?.plut_dispDamageDealt
			&& token.hud?.plut_dispDamageDealt.parent // Our display can become orphaned--in this case, we need to regenerate it
		) return;

		// If orphaned, cleanup to prevent any leaks
		if (token.hud?.plut_dispDamageDealt && !token.hud?.plut_dispDamageDealt?.parent) {
			token.removeChild(token.hud?.plut_dispDamageDealt);
			this._doDestroyText(token.hud?.plut_dispDamageDealt);
			token.hud.plut_dispDamageDealt = null;
		}

		// region Based on "Token._drawNameplate()"
		// Create the nameplate text
		token.hud.plut_dispDamageDealt = new PreciseText("", CONFIG.canvasTextStyle.clone());

		token.addChild(token.hud?.plut_dispDamageDealt);
	}

	static _doDestroyText (text) {
		if (!text?.texture) return;
		text.destroy();
	}
}

export {Patcher_Token};
