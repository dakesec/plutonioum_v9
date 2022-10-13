import {Vetools} from "./Vetools.js";
import {UtilActors} from "./UtilActors.js";
import {Config} from "./Config.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {UtilApplications} from "./UtilApplications.js";
import {DataConverter} from "./DataConverter.js";
import {UtilCompendium} from "./UtilCompendium.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {ConfigConsts} from "./ConfigConsts.js";
import {UtilDocuments} from "./UtilDocuments.js";
import {UtilCompat} from "./UtilCompat.js";
import {UtilItem} from "./UtilItem.js";

class DataConverterSpell extends DataConverter {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundrySpell",
		fnLoadJson: Vetools.pGetSpellSideData,
		propJson: "spell",
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/scroll-unfurled.svg`;

	static _getConfigKeyIsSpellPoints (opts) {
		if (opts.isActorItemNpc) return Config.getSpellPointsKey({actorType: "npc"});
		return Config.getSpellPointsKey({actorType: opts.actor?.type});
	}

	static isAllowSpellPoints (spellLevel, opts) {
		return opts.target == null
			&& opts.vetConsumes == null
			&& spellLevel !== 0
			&& Config.get("importSpell", this._getConfigKeyIsSpellPoints(opts)) !== ConfigConsts.C_SPELL_POINTS_MODE__DISABLED;
	}

	static _PassiveEntryParseStateSpell = class extends this._PassiveEntryParseState {
		constructor ({entry, img}, opts) {
			super({entry, img}, opts);

			let {
				school,
				materials,
				preparationMode,
				isPrepared,

				ability,
			} = opts;

			this.school = school;
			this.materials = materials;

			this.preparationMode = preparationMode;
			this.isPrepared = isPrepared;

			if (ability !== undefined) this.saveScaling = ability;

			this.isCustomDamageParts = false; // Avoid using SRD damage if this is set
		}
	};

	/**
	 *
	 * @param spell The spell entity.
	 * @param [opts] Options object.
	 * @param [opts.ability] A creature's spellcasting ability attribute (abbreviation).
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 * @param [opts.isActorItem]
	 * @param [opts.isActorItemNpc]
	 * @param [opts.isPrepared]
	 * @param [opts.preparationMode]
	 * @param [opts.usesValue]
	 * @param [opts.usesMax]
	 * @param [opts.usesPer]
	 * @param [opts.consumeType]
	 * @param [opts.consumeAmount]
	 * @param [opts.consumeTarget]
	 * @param [opts.vetConsumes]
	 * @param [opts.durationValue]
	 * @param [opts.durationUnit]
	 * @param [opts.castAtLevel] A level to force the spell to cast at *if it is an innate spell* (i.e., scaling dice
	 * will be set appropriately, as one cannot choose the casting level for innate spells).
	 *
	 * These parameters are used to link Charactermancer spells to their respective classes when re-loading the
	 * Charactermancer in order to level up.
	 * @param [opts.parentClassName]
	 * @param [opts.parentClassSource]
	 * @param [opts.parentSubclassName]
	 * @param [opts.parentSubclassSource]
	 * @param [opts.spellPointsItemId]
	 * @param [opts.actor]
	 * @param [opts.nameSuffix] A suffix to be added to the spell item's name, e.g. "(R)" for NPC rituals.
	 *
	 * @return {object} Item data.
	 */
	static async pGetSpellItem (spell, opts) {
		opts = opts || {};

		const state = new this._PassiveEntryParseStateSpell({entry: spell}, opts);
		await state.pInit({isSkipDescription: true, isSkipImg: true});

		const srdData = await UtilCompendium.getSrdCompendiumEntity("spell", spell);

		const description = await this._pGetDescription(spell);

		const entriesStr = JSON.stringify(spell.entries);

		this._pGetSpellItem_mutPreparationMode({spell, opts, state});
		this._pGetSpellItem_mutActionType({spell, opts, entriesStr, state});
		this._pGetSpellItem_mutSchool({spell, opts, state});
		this._pGetSpellItem_mutMaterials({spell, opts, state});
		this._pGetSpellItem_mutDuration({spell, opts, state});
		this._pGetSpellItem_mutRangeTarget({spell, opts, state});
		this._pGetSpellItem_mutDamageAndFormula({spell, opts, entriesStr, srdData, state});
		this._pGetSpellItem_mutSave({spell, opts, state});
		this._pGetSpellItem_mutConsumes({spell, opts, state});
		this._pGetSpellItem_mutActivation({spell, opts, state});

		const img = await this._pGetSaveImagePath(
			spell,
			{
				propCompendium: "spell",
				isAllowCustom: !spell.srd || Config.get("importSpell", "isUseCustomSrdIcons"),
			},
		);

		this._pGetSpellItem_mut_srdData({spell, opts, srdData, state});

		const additionalData = await this._pGetDataSideLoaded(spell, {targetUnits: state.targetUnits});
		const additionalFlags = await this._pGetFlagsSideLoaded(spell);

		const out = {
			name: UtilApplications.getCleanEntityName(`${UtilDataConverter.getNameWithSourcePart(spell, {isActorItem: opts.isActorItem})}${opts.nameSuffix || ""}`),
			type: "spell",
			data: {
				source: UtilDataConverter.getSourceWithPagePart(spell),
				description: {value: description, chat: "", unidentified: ""},

				actionType: state.actionType,
				level: this._pGetSpellItem_getLevel(spell),
				school: state.school,
				components: {
					value: "",
					vocal: spell.components && spell.components.v,
					somatic: spell.components && spell.components.s,
					material: !!(spell.components && spell.components.m),
					ritual: spell.meta && spell.meta.ritual,
					concentration: !!MiscUtil.get(spell, "duration", "0", "concentration"),
				},
				materials: {
					value: state.materials,
					consumed: !!MiscUtil.get(spell, "components", "m", "consume"),
					cost: Math.round((MiscUtil.get(spell, "components", "m", "cost") || 0) / 100),
					supply: 0,
				},
				target: {value: state.targetValue, units: state.targetUnits, type: state.targetType},
				range: {value: state.rangeShort, units: state.rangeUnits, long: state.rangeLong},
				activation: {
					type: state.activationType,
					cost: state.activationCost,
					condition: state.activationCondition,
				},
				duration: {
					value: state.durationValue,
					units: state.durationUnit,
				},
				damage: {
					parts: state.damageParts,
					versatile: "",
				},
				scaling: {
					mode: state.cantripScaling ? "cantrip" : state.scaling ? "level" : "none",
					formula: state.cantripScaling || state.scaling || "",
				},
				save: {ability: state.saveAbility, dc: null, scaling: state.saveScaling},
				ability: state.ability,
				uses: {
					value: state.usesValue,
					max: state.usesMax,
					per: state.usesPer,
				},
				attackBonus: null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				formula: state.formula,
				preparation: {
					mode: state.preparationMode,
					prepared: !!state.isPrepared,
				},
				consume: {
					type: state.consumeType,
					target: state.consumeTarget,
					amount: state.consumeAmount,
				},
				...(additionalData || {}),
			},
			img,
			flags: {
				...this._getSpellFlags(spell, opts),
				...additionalFlags,
			},
			effects: await this._pGetSpellEffects(spell, srdData, img),
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importSpell", "permissions")};

		// region Replace output with a spell from the compendium, overwriting various fields
		const replacementData = await UtilCompendium.getCompendiumEntity("spell", spell);

		if (replacementData) {
			[
				["data", "preparation"],
				["data", "uses"],
				["data", "consume"],
				["data", "ability"],
				["data", "save", "scaling"],
				["permission"],
				["flags", "srd5e"],
			].forEach(path => {
				MiscUtil.getThenSetCopy(out, replacementData, ...path);
			});

			return replacementData;
		}
		// endregion

		return out;
	}

	static _pGetSpellItem_mutPreparationMode ({spell, opts, state}) {
		// Avoid "spell slot" controls in spell points mode
		if (
			Config.get("importSpell", this._getConfigKeyIsSpellPoints(opts)) === ConfigConsts.C_SPELL_POINTS_MODE__ENABLED
			&& spell.level !== 0
			&& (!state.preparationMode || state.preparationMode === "prepared" || state.preparationMode === "always")
		) {
			state.preparationMode = "atwill";
		}

		// Assume cantrips are always prepared
		if (state.preparationMode === undefined) state.preparationMode = spell.level === 0 ? "always" : "prepared";
		if (state.isPrepared === undefined) state.isPrepared = spell.level === 0;
	}

	static _pGetSpellItem_mutActionType ({spell, opts, entriesStr, state}) {
		let actionType = "";
		if (spell.miscTags && spell.miscTags.includes("HL")) actionType = "heal";
		if (spell.savingThrow?.length) actionType = "save";
		if (entriesStr.toLowerCase().includes("melee spell attack")) actionType = "msak";
		if (entriesStr.toLowerCase().includes("ranged spell attack")) actionType = "rsak";
		if (state.actionType === undefined) state.actionType = actionType || "util";
	}

	static _pGetSpellItem_mutSchool ({spell, opts, state}) {
		state.school = UtilActors.VET_SPELL_SCHOOL_TO_ABV[spell.school] || "";
	}

	static _pGetSpellItem_mutMaterials ({spell, opts, state}) {
		state.materials = spell.components?.m
			? spell.components.m !== true
				? `${spell.components.m.text || spell.components.m}`
				: ""
			: "";
	}

	static _pGetSpellItem_mutDuration ({spell, opts, state}) {
		let durationValue = 0;
		let durationUnit = "";
		const duration0 = spell.duration[0];
		switch (duration0.type) {
			case "instant": durationUnit = "inst"; break;
			case "timed": {
				switch (duration0.duration.type) {
					case "turn": durationUnit = "turn"; durationValue = duration0.duration.amount; break;
					case "round": durationUnit = "round"; durationValue = duration0.duration.amount; break;
					case "minute": durationUnit = "minute"; durationValue = duration0.duration.amount; break;
					case "hour": durationUnit = "hour"; durationValue = duration0.duration.amount; break;
					case "day": durationUnit = "day"; durationValue = duration0.duration.amount; break;
					case "week": durationUnit = "day"; durationValue = duration0.duration.amount * 7; break;
					case "year": durationUnit = "year"; durationValue = duration0.duration.amount; break;
				}
				break;
			}
			case "permanent": durationUnit = "perm"; break;
			case "special": durationUnit = "spec"; break;
		}

		if (state.durationValue === undefined) state.durationValue = durationValue;
		if (state.durationUnit === undefined) state.durationUnit = durationUnit;
	}

	static _pGetSpellItem_mutRangeTarget ({spell, opts, state}) {
		let rangeShort = 0;
		let rangeUnits = "";
		let targetValue = 0;
		let targetUnits = "";
		let targetType = "";
		switch (spell.range.type) {
			case RNG_SPECIAL: rangeUnits = "spec"; break;
			case RNG_POINT: {
				const dist = spell.range.distance;
				switch (dist.type) {
					case RNG_SELF: {
						targetUnits = "self";
						targetType = "self";
						rangeUnits = "self";
						break;
					}
					case RNG_UNLIMITED:
					case RNG_UNLIMITED_SAME_PLANE:
					case RNG_SIGHT:
					case RNG_SPECIAL: {
						targetUnits = "spec";
						rangeUnits = "spec";
						break;
					}
					case RNG_TOUCH: {
						targetUnits = "touch";
						rangeUnits = "touch";
						break;
					}
					case UNT_MILES: {
						rangeShort = Config.getMetricNumberDistance({configGroup: "importSpell", originalValue: dist.amount, originalUnit: UNT_MILES});
						rangeUnits = Config.getMetricUnitDistance({configGroup: "importSpell", originalUnit: UNT_MILES});
						break;
					}
					case UNT_FEET:
					default: {
						rangeShort = Config.getMetricNumberDistance({configGroup: "importSpell", originalValue: dist.amount, originalUnit: UNT_FEET});
						rangeUnits = Config.getMetricUnitDistance({configGroup: "importSpell", originalUnit: UNT_FEET});
						break;
					}
				}
				break;
			}
			case RNG_LINE:
			case RNG_CUBE:
			case RNG_CONE:
			case RNG_RADIUS:
			case RNG_SPHERE:
			case RNG_HEMISPHERE:
			case RNG_CYLINDER: {
				targetValue = Config.getMetricNumberDistance({configGroup: "importSpell", originalValue: spell.range.distance.amount, originalUnit: spell.range.distance.type});

				targetUnits = Config.getMetricUnitDistance({configGroup: "importSpell", originalUnit: spell.range.distance.type});

				if (spell.range.type === RNG_HEMISPHERE) targetType = "sphere";
				else targetType = spell.range.type; // all others map directly to FVTT values
			}
		}

		state.rangeShort = rangeShort;
		state.rangeUnits = rangeUnits;

		state.targetValue = targetValue;
		state.targetUnits = targetUnits;
		state.targetType = targetType;
	}

	static _pGetSpellItem_mutDamageAndFormula ({spell, opts, entriesStr, srdData, state}) {
		let damageParts = [];
		let cantripScaling = null;
		let scaling = null;

		if (spell.scalingLevelDice) { // cantrips with parsed out values
			const scalingLevelDice = [spell.scalingLevelDice].flat(); // convert object version to array

			const getLowestKey = scaling => Math.min(...Object.keys(scaling).map(k => Number(k)));
			const reDamageType = new RegExp(`(${UtilActors.VALID_DAMAGE_TYPES.join("|")})`, "i");

			damageParts.push(...scalingLevelDice.map(scl => {
				const lowKey = getLowestKey(scl.scaling);
				const lowDice = scl.scaling[lowKey];

				const mDamageType = reDamageType.exec(scl.label || "");

				return [
					(lowDice || "").replace(/{{spellcasting_mod}}/g, "@mod"),
					mDamageType ? mDamageType[1].toLowerCase() : null,
				];
			}));

			// TODO(Future): fix this for e.g. Toll the Dead if Foundry supports multiple scaling damage dice in future
			const firstScaling = scalingLevelDice[0];
			const lowKey = getLowestKey(firstScaling.scaling);
			cantripScaling = firstScaling.scaling[lowKey];
		} else {
			let damageTuples = []; // (<damage_dice>, <damage_type>)

			if (spell.damageInflict && spell.damageInflict.length) {
				// Try to extract cantrip scaling first
				if (entriesStr.toLowerCase().includes("when you reach 5th level")) {
					const diceTiers = [];
					// Find cantrip scaling values, which are shown in brackets
					entriesStr.replace(/\({@damage ([^}]+)}\)/g, (...m) => diceTiers.push(m[1]));
					// Cantrips scale at levels 5, 11, and 17
					if (diceTiers.length === 3) {
						// Find dice _not_ in brackets
						const baseVal = /(?:^|[^(]){@damage ([^}]+)}(?:[^)]|$)/.exec(entriesStr);
						if (baseVal) cantripScaling = baseVal[1];
						// failing that, just use the first bracketed value
						else cantripScaling = diceTiers[0];
					}
				}

				this._pGetSpellItem_parseAndAddDamage(entriesStr, damageTuples);
			}

			if (spell.miscTags && spell.miscTags.some(str => str === "HL")) {
				const healingTuple = ["", "healing"];

				// Arbitrarily pick the first dice expression we find
				entriesStr.replace(this._getReDiceYourSpellcastingMod(), (...m) => {
					const [, dicePart, modPart] = m;

					healingTuple[0] = dicePart;
					if (modPart) healingTuple[0] = `${healingTuple[0]} + @mod`;
				});

				damageTuples.push(healingTuple);
			}

			const metaHigherLevel = this._pGetSpellItem_getHigherLevelMeta({spell, opts, damageTuples, isCustomDamageParts: state.isCustomDamageParts, scaling, preparationMode: state.preparationMode});
			if (metaHigherLevel) {
				damageTuples = metaHigherLevel.damageTuples;
				state.isCustomDamageParts = metaHigherLevel.isCustomDamageParts;
				scaling = metaHigherLevel.scaling;
			}

			// Do a final step to scoop up any damage info we might have missed, if we have yet to find any
			if (!damageTuples.length) this._pGetSpellItem_parseAndAddDamage(entriesStr, damageTuples);

			damageParts.push(...damageTuples);
		}
		damageParts = damageParts.filter(Boolean);

		let formula = "";
		// If there are no damage parts, arbitrarily pick the first dice expression and use that as the "other formula"
		if (!damageParts.length && !state.isCustomDamageParts && !MiscUtil.get(srdData, "data", "damage", "parts")) {
			entriesStr.replace(this._getReDiceYourSpellcastingMod(), (...m) => {
				const [, dicePart, modPart] = m;

				formula = dicePart;
				if (modPart) formula = `${formula} + @mod`;
			});
		}

		if (state.damageParts === undefined) state.damageParts = damageParts;
		if (state.cantripScaling === undefined) state.cantripScaling = cantripScaling;
		if (state.scaling === undefined) state.scaling = scaling;

		if (state.formula === undefined) state.formula = formula;
	}

	static _pGetSpellItem_mutSave ({spell, opts, state}) {
		if (spell.savingThrow?.length) {
			state.saveAbility = spell.savingThrow[0].substring(0, 3).toLowerCase();
		}

		if (state.saveScaling === undefined) state.saveScaling = "spell";
	}

	static _pGetSpellItem_mutConsumes ({spell, opts, state}) {
		if (opts.vetConsumes) {
			const sheetItem = DataConverter.getConsumedSheetItem({consumes: opts.vetConsumes, actor: opts.actor});

			state.consumeType = "charges";
			state.consumeAmount = opts.vetConsumes.amount ?? 1;
			state.consumeTarget = sheetItem?.id;

			return;
		}

		if (!this.isAllowSpellPoints(spell.level, opts)) return;

		const resource = Config.getSpellPointsResource({isValueKey: true});
		const consumeAmount = Parser.spLevelToSpellPoints(spell.level);

		if (resource === ConfigConsts.C_SPELL_POINTS_RESOURCE__SHEET_ITEM) {
			if (state.consumeType === undefined) state.consumeType = "charges";
			if (state.consumeAmount === undefined) state.consumeAmount = consumeAmount;
			if (state.consumeTarget === undefined) state.consumeTarget = opts.spellPointsItemId;
			return;
		}

		if (state.consumeType === undefined) state.consumeType = "attribute";
		if (state.consumeAmount === undefined) state.consumeAmount = consumeAmount;
		if (state.consumeTarget === undefined) state.consumeTarget = resource;
	}

	static _pGetSpellItem_getLevel (spell) {
		if (!isNaN(spell.level) && spell.level >= 0 && spell.level <= 9) return Math.round(spell.level);
		if (!isNaN(spell.level)) return Math.clamped(Math.round(spell.level), 0, 9);
		return 0;
	}

	static _pGetSpellItem_mutActivation ({spell, opts, state}) {
		state.activationType = state.activationType || spell.time[0]?.unit;
		state.activationCost = state.activationCost || spell.time[0]?.number;
		state.activationCondition = state.activationCondition || Renderer.stripTags(spell.time[0]?.condition || "");

		if (!UtilCompat.isMidiQolActive() || state.activationType !== "reaction" || !state.activationCondition) return null;

		state.activationType = "reactionmanual";

		state.activationCondition
			.replace(/\bwhich you take when you take (?:[^?!.]+ )?damage\b/i, () => {
				state.activationType = "reactiondamage";
				return "";
			})
			.replace(/\bin response to being damaged\b/i, () => {
				state.activationType = "reactiondamage";
				return "";
			})

			.replace(/\bwhen you are hit\b/i, () => {
				state.activationType = "reaction";
				return "";
			})
			.replace(/\b(?:succeeds on|makes) an attack roll\b/i, () => {
				state.activationType = "reaction";
				return "";
			})
		;
	}

	/**
	 * Apply data from the SRD compendium, if available
	 */
	static _pGetSpellItem_mut_srdData ({spell, opts, srdData, state}) {
		if (!srdData) return;

		state.targetValue = Config.getMetricNumberDistance({configGroup: "importSpell", originalValue: MiscUtil.get(srdData, "data", "target", "value"), originalUnit: MiscUtil.get(srdData, "data", "target", "units")}) || state.targetValue;
		state.targetUnits = Config.getMetricUnitDistance({configGroup: "importSpell", originalUnit: MiscUtil.get(srdData, "data", "target", "units")}) || state.targetUnits;
		state.targetType = MiscUtil.get(srdData, "data", "target", "type") || state.targetType;
		if (!state.isCustomDamageParts) state.damageParts = MiscUtil.get(srdData, "data", "damage", "parts") || state.damageParts;
		if (!state.cantripScaling && !state.scaling) state.scaling = MiscUtil.get(srdData, "data", "scaling", "formula");
	}

	static async _pGetImgCustom (spell) { return DataConverter.pGetIconImage("spell", spell); }

	static _getImgFallback (spell) {
		if (!Config.get("importSpell", "isUseDefaultSchoolImage")) return null;

		switch (spell.school) {
			case "A": return `icons/magic/defensive/shield-barrier-blue.webp`;
			case "C": return `icons/magic/unholy/silhouette-evil-horned-giant.webp`;
			case "D": return `icons/magic/perception/orb-eye-scrying.webp`;
			case "E": return `icons/magic/air/wind-vortex-swirl-purple.webp`;
			case "V": return `icons/magic/fire/projectile-fireball-orange-yellow.webp`;
			case "I": return `icons/magic/defensive/illusion-evasion-echo-purple.webp`;
			case "N": return `icons/magic/unholy/hand-fire-skeleton-pink.webp`;
			case "T": return `icons/magic/movement/abstract-ribbons-red-orange.webp`;
		}
	}

	static _getSpellFlags (
		spell,
		{
			parentClassName,
			parentClassSource,
			parentSubclassName,
			parentSubclassSource,
		} = {},
	) {
		const out = {
			[SharedConsts.MODULE_NAME_FAKE]: {
				page: UrlUtil.PG_SPELLS,
				source: spell.source,
				hash: UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_SPELLS](spell),
				propDroppable: "spell",
			},
		};

		if (!parentClassName && !parentClassSource && !parentSubclassName && !parentSubclassSource) return out;

		out[SharedConsts.MODULE_NAME_FAKE].parentClassName = parentClassName;
		out[SharedConsts.MODULE_NAME_FAKE].parentClassSource = parentClassSource;
		out[SharedConsts.MODULE_NAME_FAKE].parentSubclassName = parentSubclassName;
		out[SharedConsts.MODULE_NAME_FAKE].parentSubclassSource = parentSubclassSource;

		if (UtilCompat.isModuleMulticlassSpellbookFilterActive()) {
			out[UtilCompat.MODULE_MULTICLASS_SPELLBOOK_FILTER] = {parentClass: UtilItem.getNameAsIdentifier(parentClassName)};
		}

		return out;
	}

	static async _pGetSpellEffects (spell, srdData, img) {
		const out = [];

		const effectsSrd = MiscUtil.copy(srdData?.effects || []);
		effectsSrd.forEach(effect => effect.icon = img);
		DataConverter.mutEffectsDisabledTransfer(effectsSrd, "importSpell", {hintTransfer: false, hintDisabled: false});
		out.push(...effectsSrd);

		if (await this.pHasSpellSideLoadedEffects(null, spell)) {
			const effectsSideTuples = await this.pGetSpellItemEffectTuples(null, spell, null, {img});
			effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importSpell", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));
			out.push(...effectsSideTuples.map(it => it.effect));
		}

		return out;
	}

	static _pGetSpellItem_parseAndAddDamage (entriesStr, damageTuples) {
		// If there's a damage type, try find the spell's damage
		entriesStr.replace(/{@damage ([^}]+)} ([^ ]+)(, [^ ]+)*(,? or [^ ]+)? damage/ig, (...m) => {
			// TODO(Future): add multiple damage types as choices when Foundry supports this--for now, just
			//   choose the first we find
			damageTuples.push([m[1], m[2]]);
		});
	}

	static _getReDiceYourSpellcastingMod () {
		// Only capture the first result (i.e. no [g]lobal)
		return /{@dice ([^}]+)}(\s*\+\s*your\s+spellcasting\s+ability\s+modifier)?/i;
	}

	static _pGetSpellItem_getHigherLevelMeta (
		{
			spell,
			opts,
			damageTuples,
			isCustomDamageParts,
			scaling,
			preparationMode,
		},
	) {
		if (!spell.entriesHigherLevel) return;

		const out = {
			damageTuples: MiscUtil.copy(damageTuples),
			isCustomDamageParts,
			scaling,
		};

		const reHigherLevel = /{@(?:scaledice|scaledamage) ([^}]+)}/gi;
		const resAdditionalNumber = [
			/\badditional (?<addPerLevel>\d+) for each (?:slot )?level\b/gi,
			/\bincreases by (?<addPerLevel>\d+) for each (?:slot )?level\b/gi,
		];

		let fnStr = null;

		// region Innate spellcasters
		const ixsScaled = new Set(); // Track which we've scaled, to avoid scaling the same tuple multiple times

		const fnStrInnate = str => {
			str
				.replace(reHigherLevel, (...m) => {
					const [base] = m[1].split("|").map(it => it.trim());

					const [tag, text] = Renderer.splitFirstSpace(m[0].slice(1, -1));
					const scaleOptions = Renderer.parseScaleDice(tag, text);

					const ixDamageTuple = out.damageTuples.findIndex(it => (it[0] || "").trim().toLowerCase() === base.toLowerCase());
					if (!ixsScaled.has(ixDamageTuple) && ~ixDamageTuple) {
						const diceAtLevel = scaleOptions?.prompt?.options?.[opts.castAtLevel];
						if (diceAtLevel) {
							ixsScaled.add(ixDamageTuple);
							out.damageTuples[ixDamageTuple][0] += `+ ${diceAtLevel}`;
							out.isCustomDamageParts = true;
						}
					}
				});

			resAdditionalNumber.forEach(re => {
				str
					.replace(re, (...m) => {
						if (!out.damageTuples.length) return;

						const toAdd = opts.castAtLevel * Number(m.last().addPerLevel);
						// For generic "add N"s (e.g. the Aid spell) add to the first dice expression
						out.damageTuples[0][0] += `+ ${toAdd}`;
						out.isCustomDamageParts = true;
					});
			});
		};
		// endregion

		// region Standard spellcasters
		// FIXME(future) FVTT doesn't yet support progression in non-linear increments, or multiple scaling
		//   modes, so just pick the first one
		const fnStrStandard = str => {
			if (out.scaling) return;

			str
				.replace(reHigherLevel, (...m) => {
					if (out.scaling) return;

					const [, progression, addPerProgress] = m[1].split("|");

					const progressionParse = MiscUtil.parseNumberRange(progression, 1, 9);
					const [p1, p2] = [...progressionParse].sort(SortUtil.ascSort);
					const baseLevel = Math.min(...progressionParse);

					// out.scaling = `floor((max(0, @item.level - ${baseLevel})) / (${p2} - ${p1})) * ${addPerProgress}`;

					out.scaling = addPerProgress;
				});

			resAdditionalNumber.forEach(re => {
				str
					.replace(re, (...m) => {
						if (out.scaling) return;

						// Flat numbers need to be multiplied; they are not auto-scaled
						out.scaling = `(@item.level - ${spell.level}) * ${m.last().addPerLevel}`;
					});
			});
		};
		// endregion

		// For innate spells cast at a higher level, override the damage tuples with the upscaled version of the
		//   spell. We do this as Foundry doesn't let you choose the spell level when casting an innate spell.
		if (opts.castAtLevel != null && opts.castAtLevel !== spell.level && out.damageTuples.length && preparationMode === "innate") {
			fnStr = fnStrInnate;
		} else {
			fnStr = fnStrStandard;
		}

		MiscUtil.getWalker({isNoModification: true})
			.walk(
				spell.entriesHigherLevel,
				{
					string: str => fnStr(str),
				},
			);

		return out;
	}

	static _pGetDescription (spell) {
		if (!Config.get("importSpell", "isImportDescription")) return "";

		return UtilDataConverter.pGetWithDescriptionPlugins(async () => {
			const entries = await DataConverter.pGetEntryDescription(spell);
			const entriesHigherLevel = spell.entriesHigherLevel
				? await DataConverter.pGetEntryDescription(spell, {prop: "entriesHigherLevel"})
				: "";

			const stackPts = [entries, entriesHigherLevel];

			if (Config.get("importSpell", "isIncludeClassesInDescription")) {
				const fromClassList = Renderer.spell.getCombinedClasses(spell, "fromClassList");
				if (fromClassList?.length) {
					const [current] = Parser.spClassesToCurrentAndLegacy(fromClassList);
					stackPts.push(`<div><span class="bold">Classes: </span>${Parser.spMainClassesToFull(current, {isTextOnly: true})}</div>`);
				}
			}

			return stackPts.filter(Boolean).join("");
		});
	}

	static async _pGetDataSideLoaded (spell, {targetUnits} = {}) {
		const out = await super._pGetDataSideLoaded(spell);
		if (!out) return out;

		// Apply metric conversion to loaded data, if required
		if (out["target.value"]) out["target.value"] = Config.getMetricNumberDistance({configGroup: "importSpell", originalValue: out["target.value"], originalUnit: out["target.units"] || targetUnits});
		if (out["target.units"]) out["target.units"] = Config.getMetricUnitDistance({configGroup: "importSpell", originalUnit: out["target.units"] || targetUnits});

		return out;
	}

	static getActorSpell (actor, name, source) {
		if (!name || !source) return null;
		return actor.items && actor.items.find(it =>
			(it.name || "").toLowerCase() === name.toLowerCase()
			&& (
				!Config.get("import", "isStrictMatching")
				|| (UtilDataConverter.getItemSource(it).source || "").toLowerCase() === source.toLowerCase()
			),
		);
	}

	static async pSetSpellItemIsPrepared (item, isPrepared) {
		if (!item) return;
		await UtilDocuments.pUpdateDocument(item, {data: {preparation: {prepared: isPrepared}}});
	}

	static async pHasSpellSideLoadedEffects (actor, spell) {
		return (await DataConverter._pGetEffectsRawSideLoaded_(spell, this._SIDE_LOAD_OPTS))?.length > 0;
	}

	static async pGetSpellItemEffectTuples (actor, spell, sheetItem, {additionalData, img} = {}) {
		const effectsRaw = await DataConverter._pGetEffectsRawSideLoaded_(spell, this._SIDE_LOAD_OPTS);
		return UtilActiveEffects.getExpandedEffects(effectsRaw || [], {actor, sheetItem, parentName: spell.name, additionalData, img}, {isTuples: true});
	}
}

export {DataConverterSpell};
