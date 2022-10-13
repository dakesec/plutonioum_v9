/**
 * The active effects modes are as follows. Each has a default priority (effects are applied low-to-high)
 *   of `10 * mode`, so...
 * CONST.ACTIVE_EFFECT_MODES = {
 *   "CUSTOM":      0,  =>  priority  0
 *   "MULTIPLY":    1,  =>  priority 10
 *   "ADD":         2,  =>  priority 20
 *   "DOWNGRADE":   3,  =>  priority 30
 *   "UPGRADE":     4,  =>  priority 40
 *   "OVERRIDE":    5,  =>  priority 50
 * }
 * DAE uses the following priorities, to allow e.g. base AC to be modified by additional AC:
 * "OVERRIDE"  =>  priority 4
 * "ADD"       =>  priority 7
 * i.e. "OVERRIDE" is applied first, then "ADD".
 */

import {SharedConsts} from "../shared/SharedConsts.js";

class ActiveEffectMeta {
	constructor (path, mode, defaultVal) {
		this.path = path;
		this.mode = mode;
		this.default = defaultVal;
	}

	get dataType () { return typeof this.default; }
}

class UtilActiveEffects {
	static _PATHS_EXTRA__AC = [
		"data.attributes.ac.base", // note that this is intended as a "read-only"/result field
		"data.attributes.ac.armor",
		"data.attributes.ac.dex",
		"data.attributes.ac.shield",
		"data.attributes.ac.bonus",
		"data.attributes.ac.cover",
	];

	static init () {
		UtilActiveEffects._AVAIL_EFFECTS_ACTOR_DND5E.push(
			new ActiveEffectMeta("data.attributes.prof", CONST.ACTIVE_EFFECT_MODES.OVERRIDE, 1),

			new ActiveEffectMeta("data.resources.primary.label", CONST.ACTIVE_EFFECT_MODES.OVERRIDE, ""),
			new ActiveEffectMeta("data.resources.secondary.label", CONST.ACTIVE_EFFECT_MODES.OVERRIDE, ""),
			new ActiveEffectMeta("data.resources.tertiary.label", CONST.ACTIVE_EFFECT_MODES.OVERRIDE, ""),

			...Object.entries((CONFIG?.DND5E?.characterFlags) || {})
				.map(([k, meta]) => new ActiveEffectMeta(
					`flags.dnd5e.${k}`,
					CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
					meta.placeholder != null ? MiscUtil.copy(meta.placeholder) : meta.type()),
				),

			// region Currently (as of 2022-02-05) these all work, but do not have sheet UI. Add them manually.
			// See `Item5e.rollDamage`
			...Object.keys((CONFIG?.DND5E?.itemActionTypes) || {})
				.map(k => [
					new ActiveEffectMeta(
						`data.bonuses.${k}.attack`,
						CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
						"",
					),
					new ActiveEffectMeta(
						`data.bonuses.${k}.damage`,
						CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
						"",
					),
				])
				.flat(),
			// endregion

			// region Add synthetic AC properties
			//   See: _prepareBaseArmorClass
			//   "Initialize derived AC fields for Active Effects to target."
			...this._PATHS_EXTRA__AC.map(path => new ActiveEffectMeta(
				path,
				CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
				"",
			)),
			// endregion
		);
	}

	/**
	 * @param entity
	 * @param [opts] As passed in to the render hook for an `ActiveEffectConfig`
	 * @param [opts.isActorEffect]
	 * @param [opts.isItemEffect]
	 */
	static getAvailableEffects (entity, opts) {
		opts = opts || {};

		let modelMeta;
		if (opts.isItemEffect) modelMeta = game.system.model.Item;
		else if (opts.isActorEffect) modelMeta = game.system.model.Actor;
		else throw new Error(`Unhandled effect mode, was neither an item effect nor an actor effect!`);

		const model = modelMeta[entity.data.type];

		const baseEffects = Object.entries(foundry.utils.flattenObject(model))
			// Default everything to "override" when displaying in the UI
			.map(([keyPath, defaultVal]) => new ActiveEffectMeta(`data.${keyPath}`, CONST.ACTIVE_EFFECT_MODES.OVERRIDE, defaultVal));

		if (opts.isItemEffect) return baseEffects;
		return [...baseEffects, ...UtilActiveEffects._AVAIL_EFFECTS_ACTOR_DND5E]
			.unique(it => it.path)
			.sort(SortUtil.ascSortLowerProp.bind(null, "path"));
	}

	/**
	 * @param entity
	 * @param [opts] As passed in to the render hook for an `ActiveEffectConfig`
	 * @param [opts.isActorEffect]
	 * @param [opts.isItemEffect]
	 */
	static getAvailableEffectsLookup (entity, opts) {
		const effects = this.getAvailableEffects(entity, opts);
		const out = {};
		effects.forEach(it => out[it.path] = it);
		return out;
	}

	static getActiveEffectType (lookup, path) {
		if (!path) return undefined;

		// Note that all custom keys are just prefixed regular keys, so this works
		path = this.getKeyFromCustomKey(path);

		if (!lookup[path]) return undefined;
		const meta = lookup[path];
		if (meta.default === undefined) return "undefined";
		if (meta.default === null) return "null";
		if (meta.default instanceof Array) return "array";
		return typeof meta.default;
	}

	static getActiveEffectDefault (lookup, path) {
		if (!path) return undefined;
		path = this.getKeyFromCustomKey(path);
		return lookup[path]?.default;
	}

	static getExpandedEffects (
		rawEffects,
		{actor = null, sheetItem = null, parentName = "", additionalData = null, img = null} = {},
		{isTuples = false} = {},
	) {
		if (!rawEffects || !rawEffects.length) return [];

		const tuples = [];

		// Convert the reduced versions in the side data to full-data effects
		for (const effectRaw of rawEffects) {
			// Create a version of the raw effect with all our known/used props removed; we'll copy the rest over to the
			//   final effect.
			const cpyEffectRaw = MiscUtil.copy(effectRaw);
			["name", "priority", "icon", "disabled", "changes"].forEach(prop => delete cpyEffectRaw[prop]);

			const effect = UtilActiveEffects.getGenericEffect({
				label: effectRaw.name ?? parentName,
				priority: effectRaw?.changes?.length
					? Math.max(...effectRaw.changes.map(it => UtilActiveEffects.getPriority(UtilActiveEffects.getFoundryMode({mode: it.mode}))))
					: 0,
				icon: img ?? sheetItem?.img ?? actor?.data?.img ?? actor?.data?.token?.image,
				disabled: !!effectRaw.disabled,
				transfer: !!effectRaw.transfer,
			});

			if (actor && sheetItem) effect.origin = `Actor.${actor.id}.Item.${sheetItem.id}`;

			effect.changes = effect.changes || [];
			(effectRaw.changes || []).forEach(rawChange => {
				const mode = UtilActiveEffects.getFoundryMode(rawChange.mode);

				// A single raw key can be expanded to multiple keys, e.g.:
				// `"data.abilities.<$import.chosenAbilityScoreIncrease.keys()$>.proficient"` ->
				//   `"data.abilities.str.proficient"` and `"data.abilities.dex.proficient"`
				const allKeys = this._getExpandedEffects_getAllKeys({rawKey: rawChange.key, additionalData});
				allKeys.forEach(key => {
					effect.changes.push({
						key,
						mode,
						value: rawChange.value,
						priority: UtilActiveEffects.getPriority({mode, rawPriority: rawChange.priority}),
					});
				});
			});

			// Ensure we copy over any other fields as-is (`"duration"`, `"flags"`, etc.)
			Object.entries(cpyEffectRaw)
				.forEach(([k, v]) => {
					effect[k] = v;
				});

			tuples.push({effect, effectRaw});
		}

		return isTuples ? tuples : tuples.map(it => it.effect);
	}

	/**
	 * Process keys which contain templates
	 * @param rawKey
	 * @param additionalData
	 * @return *
	 */
	static _getExpandedEffects_getAllKeys ({rawKey, additionalData}) {
		if (!additionalData) return [rawKey];

		const keyVariableNonVariableSections = rawKey.split(/(<\$[^$]+\$>)/g).map(it => it.trim()).filter(Boolean);
		if (keyVariableNonVariableSections.length === 1) return [rawKey];

		// A section can either be a single `"<$a.b.c$>"` variable (the internal paths of which should NOT be split), or a
		//   Foundry data path part; `"data.abilities."` (note the potential for leading/trailing dots). We change this
		//   into an array of either <variable|single path part prop>.
		const keyParts = keyVariableNonVariableSections.map(sect => {
			if (/^<\$[^$]+\$>$/.test(sect)) return sect;
			return sect.split(".").map(it => it.trim()).filter(Boolean);
		}).flat();

		const allKeys = [];
		this._getExpandedEffects_recurseKey({
			additionalData,
			out: allKeys,
			stack: [],
			keyParts,
			depth: 0,
		});
		return allKeys;
	}

	static _getExpandedEffects_recurseKey ({additionalData, out, stack, keyParts, depth}) {
		const keyPart = keyParts[depth];

		const mVariable = /^<\$([^$]+)\$>$/.exec(keyPart);
		if (mVariable) {
			const expandedAdditionalDataPaths = [];

			let fnName = null;
			let variablePart = mVariable[1];

			const mFunctionOuter = /^([^(]+)\((.*?)\)$/.exec(variablePart);
			if (mFunctionOuter) {
				const [, fnName_, fnArg] = mFunctionOuter;
				fnName = fnName_;
				variablePart = fnArg;
			}

			const variableTokens = variablePart.split(".").map(it => it.trim()).filter(Boolean);

			this._getExpandedEffects_recurseKeyPart({
				additionalData,
				out: expandedAdditionalDataPaths,
				stack: [],
				tokens: variableTokens,
				depth: 0,
			});

			// Re-run at this depth, swapping in new key parts based on our expanded additional data paths
			let nxtKeyParts = expandedAdditionalDataPaths.map(it => MiscUtil.get(additionalData, ...it.split(".")));

			// If any of the parts could not be found, bail out
			if (nxtKeyParts.some(it => it == null)) return;

			if (fnName) nxtKeyParts = nxtKeyParts.map(it => this._getExpandedEffects_getKeyVariableFunctionOutput({fn: fnName, additionalDataValue: it})).flat();

			nxtKeyParts.forEach(it => {
				const nxtKeyParts = MiscUtil.copy(keyParts);
				nxtKeyParts[depth] = it;
				this._getExpandedEffects_recurseKey({additionalData, out, stack, keyParts: nxtKeyParts, depth});
			});
		} else {
			if (depth === keyParts.length - 1) {
				out.push([...stack, keyPart].join("."));
				return;
			}

			stack.push(keyPart);
			this._getExpandedEffects_recurseKey({additionalData, out, stack, keyParts, depth: depth + 1});
			stack.pop();
		}
	}

	static _getExpandedEffects_getKeyVariableFunctionOutput ({fn, additionalDataValue}) {
		switch (fn) {
			case "keys": return Object.keys(additionalDataValue ?? {});

			default: return additionalDataValue[fn]();
		}
	}

	static _getExpandedEffects_recurseKeyPart ({additionalData, out, stack, tokens, depth}) {
		const token = tokens[depth];

		if (token.endsWith("()")) {
			const fn = token.slice(0, -2);
			const fnRet = this._getExpandedEffects_getKeyPartFunctionOutput({fn, additionalData, stack});

			// Re-run at this depth, swapping in new tokens based on our function evaluation
			if (fnRet == null) return;
			const fnRets = fnRet instanceof Array ? fnRet : [fnRet];
			fnRets.forEach(it => {
				const nxtTokens = MiscUtil.copy(tokens);
				nxtTokens[depth] = it;
				this._getExpandedEffects_recurseKeyPart({additionalData, out, stack, tokens: nxtTokens, depth});
			});
		} else {
			if (depth === tokens.length - 1) {
				out.push([...stack, token].join("."));
				return;
			}

			stack.push(token);
			this._getExpandedEffects_recurseKeyPart({additionalData, out, stack, tokens, depth: depth + 1});
			stack.pop();
		}
	}

	static _getExpandedEffects_getKeyPartFunctionOutput ({fn, additionalData, stack}) {
		const prevObj = MiscUtil.get(additionalData, ...stack);
		switch (fn) {
			case "keys": return Object.keys(prevObj ?? {});

			default: return prevObj[fn]();
		}
	}

	static getGenericEffect (
		{
			label = "",
			icon = "icons/svg/aura.svg",
			disabled = false,
			transfer = true,

			key = "",
			value = "",
			mode = CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
			priority = null,

			durationSeconds = null,
			durationRounds = null,
			durationTurns = null,

			changes = null,

			originActor = null,
			originActorItem = null,

			flags = null,
		} = {},
	) {
		if (changes && (key || value)) throw new Error(`Generic effect args "key"/"value" and "changes" are mutually exclusive!`);

		const change = key || value ? this.getGenericChange({key, value, mode, priority}) : null;

		flags = flags || {};

		return {
			label,
			icon,
			changes: changes ?? [change].filter(Boolean),
			disabled,
			duration: {
				startTime: null,
				seconds: durationSeconds,
				rounds: durationRounds,
				turns: durationTurns,
				startRound: null,
				startTurn: null,
			},
			// origin: "Item.<item ID>",
			//   or
			// origin: "Actor.<actor ID>.Item.<item ID>",
			origin: originActor ? originActorItem ? `Actor.${originActor.id}.Item.${originActorItem.id}` : `Actor.${originActor.id}` : null,
			tint: "",
			transfer,
			flags,
		};
	}

	static getGenericChange (
		{
			key,
			value,
			mode = CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
			priority = null,
		},
	) {
		if (key == null || value === undefined) throw new Error(`Generic effect change "key" and "value" must be defined!`);
		return {
			key,
			mode,
			value,
			priority,
		};
	}

	static getCustomKey (key) { return `${SharedConsts.MODULE_NAME_FAKE}.${key}`; }
	static getKeyFromCustomKey (customKey) { return customKey.replace(new RegExp(`${SharedConsts.MODULE_NAME_FAKE}\\.`), ""); }

	static getFoundryMode (modeStrOrInt) {
		if (typeof modeStrOrInt === "number") return modeStrOrInt;
		const [, out = 0] = Object.entries(CONST.ACTIVE_EFFECT_MODES)
			.find(([k]) => k.toLowerCase() === `${modeStrOrInt}`.trim().toLowerCase()) || [];
		return out;
	}

	static getPriority ({mode, rawPriority = null}) {
		if (rawPriority != null && !isNaN(rawPriority)) return rawPriority;
		return mode >= CONST.ACTIVE_EFFECT_MODES.DOWNGRADE ? UtilActiveEffects.PRIORITY_BASE : UtilActiveEffects.PRIORITY_BONUS;
	}

	static _HINTS_DEFAULT_SIDE = {hintTransfer: false, hintDisabled: false};
	static getDisabledTransferHintsSideData (effectRaw) {
		const out = MiscUtil.copy(this._HINTS_DEFAULT_SIDE);
		if (effectRaw?.transfer != null) out.hintTransfer = effectRaw.transfer;
		if (effectRaw?.disabled != null) out.hintDisabled = effectRaw.disabled;
		return out;
	}
}
UtilActiveEffects._AVAIL_EFFECTS_ACTOR_DND5E = [];

UtilActiveEffects.PRIORITY_BASE = 4;
UtilActiveEffects.PRIORITY_BONUS = 7;

export {UtilActiveEffects};
