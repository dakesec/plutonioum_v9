import {SharedConsts} from "../shared/SharedConsts.js";
import {UtilActors} from "./UtilActors.js";
import {Config} from "./Config.js";
import {UtilApplications} from "./UtilApplications.js";
import {Vetools} from "./Vetools.js";
import {Consts} from "./Consts.js";
import {
	Charactermancer_ConditionImmunitySelect,
	Charactermancer_DamageVulnerabilitySelect,
	Charactermancer_DamageResistanceSelect,
	Charactermancer_DamageImmunitySelect,
	Charactermancer_OtherProficiencySelect,
	Charactermancer_ExpertiseSelect,
} from "./UtilCharactermancer.js";
import {LGT, Util} from "./Util.js";
import {UtilCompat} from "./UtilCompat.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {UtilCompendium} from "./UtilCompendium.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";
import {ConfigConsts} from "./ConfigConsts.js";
import {UtilAutomation} from "./UtilAutomation.js";

class DataConverter {
	// region Side data fetching
	// TODO factor effect fetching to this level
	// TODO remove `pHasSideLoadedEffects` as it is uninteresting

	static _SIDE_LOAD_OPTS = null;

	static async _pGetDataSideLoaded (ent, {propOpts = "_SIDE_LOAD_OPTS"} = {}) {
		const opts = this._getSideLoadOpts(ent) || this[propOpts];
		if (!opts) return null;
		return DataConverter._pGetDataSideLoaded_(ent, opts);
	}

	static async _pGetFlagsSideLoaded (ent, {propOpts = "_SIDE_LOAD_OPTS"} = {}) {
		const opts = this._getSideLoadOpts(ent) || this[propOpts];
		if (!opts) return null;
		return DataConverter._pGetFlagsSideLoaded_(ent, opts);
	}

	static async _pGetAdvancementSideLoaded (ent, {propOpts = "_SIDE_LOAD_OPTS"} = {}) {
		const opts = this._getSideLoadOpts(ent) || this[propOpts];
		if (!opts) return null;
		return DataConverter._pGetAdvancementSideLoaded_(ent, opts);
	}

	static async _pGetImgSideLoaded (ent, {propOpts = "_SIDE_LOAD_OPTS"} = {}) {
		const opts = this._getSideLoadOpts(ent) || this[propOpts];
		if (!opts) return null;
		return DataConverter._pGetImgSideLoaded_(ent, opts);
	}

	static async _pGetIsIgnoredSideLoaded (ent, {propOpts = "_SIDE_LOAD_OPTS"} = {}) {
		const opts = this._getSideLoadOpts(ent) || this[propOpts];
		if (!opts) return null;
		return DataConverter._pGetIsIgnoredSideLoaded_(ent, opts);
	}

	static async _pGetEffectsRawSideLoaded (ent, {propOpts = "_SIDE_LOAD_OPTS"} = {}) {
		const opts = this._getSideLoadOpts(ent) || this[propOpts];
		if (!opts) return null;
		return DataConverter._pGetEffectsRawSideLoaded_(ent, opts);
	}

	static async _pGetEffectsSideLoadedTuples ({ent, actor = null, sheetItem = null, additionalData = null, img = null}, {propOpts = "_SIDE_LOAD_OPTS"} = {}) {
		const outRaw = await this._pGetEffectsRawSideLoaded(ent, {propOpts});
		if (!outRaw?.length) return [];

		return UtilActiveEffects.getExpandedEffects(
			outRaw,
			{
				actor,
				sheetItem,
				parentName: ent._displayName || ent.name,
				img,
			},
			{
				isTuples: true,
			},
		);
	}

	// Implement as required
	static _getSideLoadOpts (ent) { return null; }
	// endregion

	// region Image fetching
	static _IMG_FALLBACK = null;

	static async _pGetImagePath (ent, {fluff, propCompendium, isAllowCustom} = {}) {
		return this._pGetImagePath_(ent, {fluff, propCompendium, isAllowCustom});
	}

	static async _pGetSaveImagePath (ent, {fluff, propCompendium, isAllowCustom} = {}) {
		return Vetools.pOptionallySaveImageToServerAndGetUrl(await this._pGetImagePath(ent, {fluff, propCompendium, isAllowCustom}));
	}

	static async _pGetImagePath_ (ent, {fluff, propCompendium, isAllowCustom} = {}) {
		if (ent.foundryImg) return ent.foundryImg;

		const fromSide = await this._pGetImgSideLoaded(ent);
		if (fromSide) return fromSide;

		const getters = [
			async () => {
				// Custom mappings, e.g. preset spell/feat icons
				if (isAllowCustom) {
					const fromCustom = await this._pGetImgCustom(ent);
					if (fromCustom) return fromCustom;
				}

				if (fluff) {
					const fromFluff = await Vetools.pGetImageUrlFromFluff(fluff);
					if (fromFluff) return fromFluff;
				}
			},
			async () => {
				if (!propCompendium) return null;

				const fromCompendium = await this._pGetImagePath_pGetCompendiumImage({ent, propCompendium});
				if (fromCompendium) return fromCompendium;
			},
		];
		if (Config.get("import", "isPreferFoundryImages")) getters.reverse();

		for (const getter of getters) {
			const url = await getter();
			if (url) return url;
		}

		// Dynamic fallback
		const fromFallback = this._getImgFallback(ent);
		if (fromFallback) return fromFallback;

		// Static fallback
		return this._IMG_FALLBACK;
	}

	static async _pGetImagePath_pGetCompendiumImage ({ent, propCompendium}) {
		return UtilCompendium.pGetCompendiumImage(propCompendium, ent, {fnGetAliases: this._getCompendiumAliases.bind(this), isIgnoreSrd: true});
	}

	// Implement as required
	static async _pGetImgCustom (ent) { return null; }
	static _getImgFallback (ent) { return null; }
	static _getCompendiumAliases (ent) { return []; }
	// endregion

	static getTagUids (tag, str) {
		const re = new RegExp(`{@${tag} ([^}]+)}`, "gi");
		const out = [];
		str.replace(re, (...m) => out.push(m[1]));
		return out;
	}

	static async pGetIconImage (entityType, entity) {
		switch (entityType) {
			case "spell": {
				const iconLookup = await Vetools.pGetIconLookup(entityType);
				return MiscUtil.get(iconLookup, entity.source, entity.name);
			}
			case "feat": {
				const iconLookup = await Vetools.pGetIconLookup(entityType);
				const path = MiscUtil.get(iconLookup, entity.source, entity.name);
				if (!path) return null;
				return `modules/${SharedConsts.MODULE_NAME}/${path}`;
			}
			default: return null;
		}
	}

	/** Combine Foundry-specific data found on entries. Pure takes precedence over underscore. */
	static getCombinedFoundryData (foundryData, _foundryData) {
		if (!_foundryData && !foundryData) return {};

		const combinedFoundryData = MiscUtil.copy(_foundryData || {});
		Object.assign(combinedFoundryData, MiscUtil.copy(foundryData || {}));

		return combinedFoundryData;
	}

	/** Combine Foundry-specific flags found on entries. Pure takes precedence over underscore. */
	static getCombinedFoundryFlags (foundryFlags, _foundryFlags) {
		if (!foundryFlags && !_foundryFlags) return {};

		const combinedFoundryFlags = MiscUtil.copy(_foundryFlags || {});

		// Since flags are namespaced at the outer level, overwrite entries at one level deep.
		Object.entries(MiscUtil.copy(foundryFlags || {}))
			.forEach(([flagNamespace, flagData]) => {
				if (!combinedFoundryFlags[flagNamespace]) return combinedFoundryFlags[flagNamespace] = flagData;
				Object.assign(combinedFoundryFlags[flagNamespace], flagData);
			});

		return combinedFoundryFlags;
	}

	/**
	 * @param entry Entry to render.
	 * @param [opts] Options object.
	 * @param [opts.prop] Entry property.
	 * @param [opts.depth] Render depth.
	 * @param [opts.summonSpellLevel]
	 * @return {Promise<String>}
	 */
	static async pGetEntryDescription (entry, opts) {
		opts = opts || {};
		opts.prop = opts.prop || "entries";

		let description = "";
		if (entry[opts.prop]) {
			let cpyEntries = MiscUtil.copy(entry[opts.prop]);

			cpyEntries = UtilDataConverter.WALKER_GENERIC.walk(
				cpyEntries,
				{
					string: (str) => {
						return str
							// Replace `@hitYourSpellAttack`
							.replace(/{@hitYourSpellAttack}/gi, () => `{@dice 1d20 + @srd5e.userchar.spellAttackRanged|your spell attack modifier}`)
							.replace(/{(@dice|@damage|@scaledice|@scaledamage|@hit) ([^}]+)}/gi, (...m) => {
								const [, tag, text] = m;
								let [rollText, displayText, name, ...others] = Renderer.splitTagByPipe(text);
								const originalRollText = rollText;

								rollText = this._pGetEntryDescription_getCleanDicePart(rollText, opts);
								displayText = this._pGetEntryDescription_getCleanDisplayPart({displayText, originalText: originalRollText, text: rollText});

								return `{${tag} ${[rollText, displayText || "", name || "", ...others].join("|")}}`;
							})
							.replace(/{(@dc) ([^}]+)}/gi, (...m) => {
								const [, tag, text] = m;
								let [dcText, displayText] = Renderer.splitTagByPipe(text);
								const originalDcText = dcText;

								dcText = this._pGetEntryDescription_getCleanDicePart(dcText, opts);
								displayText = this._pGetEntryDescription_getCleanDisplayPart({displayText, originalText: originalDcText, text: dcText});

								return `{${tag} ${[dcText, displayText || ""].join("|")}}`;
							})
						;
					},
				},
			);

			description = await UtilDataConverter.pGetWithDescriptionPlugins(
				() => Renderer.get().setFirstSection(true).render(
					{
						type: "entries",
						entries: cpyEntries,
					},
					opts.depth != null ? opts.depth : 2,
				),
			);
		}

		return description;
	}

	static _pGetEntryDescription_getCleanDicePart (str, opts) {
		return str
			// Replace `+ PB`
			.replace(/\bPB\b/gi, `@srd5e.userchar.pb`)
			// Replace `+ summonSpellLevel`
			.replace(/\bsummonSpellLevel\b/gi, `${opts.summonSpellLevel ?? 0}`);
	}

	static _pGetEntryDescription_getCleanDisplayPart ({displayText, originalText, text}) {
		// If we did any replaces, ensure the display text does not change
		if (!displayText && originalText !== text) {
			displayText = originalText
				// Replace `+ summonSpellLevel`
				.replace(/\bsummonSpellLevel\b/gi, `the spell's level`);
		}
		return displayText;
	}

	/**
	 * Note that (where appropriate) updates should first load the actor's data, copy it, and modify it to suit.
	 *
	 * @param actor The actor's current data.
	 * @param actorUpdate The actor update data to be mutated.
	 * @param entry Entry to process.
	 * @param [opts] Options object.
	 * @param [opts.sideData] Side-loaded Foundry data.
	 * @param [opts.sideData.actorDataMod] Generic actor data modifications to apply.
	 * @param [opts.sideData.actorTokenMod] Generic actor token modifications to apply.
	 */
	static mutActorUpdate (actor, actorUpdate, entry, opts) {
		opts = opts || {};

		this._mutActorUpdate_mutFromSideDataMod(actor, actorUpdate, opts);
		this._mutActorUpdate_mutFromSideTokenMod(actor, actorUpdate, opts);
	}

	static _mutActorUpdate_mutFromSideDataMod (actor, actorUpdate, opts) {
		return this._mutActorUpdate_mutFromSideMod(actor, actorUpdate, opts, "actorDataMod", "data");
	}

	static _mutActorUpdate_mutFromSideTokenMod (actor, actorUpdate, opts) {
		return this._mutActorUpdate_mutFromSideMod(actor, actorUpdate, opts, "actorTokenMod", "token");
	}

	static _mutActorUpdate_mutFromSideMod (actor, actorUpdate, opts, sideProp, actorProp) {
		if (!opts.sideData || !opts.sideData[sideProp]) return;

		Object.entries(opts.sideData[sideProp])
			.forEach(([path, modMetas]) => this._mutActorUpdate_mutFromSideMod_handleProp(actor, actorUpdate, opts, sideProp, actorProp, path, modMetas));
	}

	static _mutActorUpdate_mutFromSideMod_handleProp (actor, actorUpdate, opts, sideProp, actorProp, path, modMetas) {
		const pathParts = path.split(".");

		// "Special" paths
		if (path === "_") {
			modMetas.forEach(modMeta => {
				switch (modMeta.mode) {
					case "conditionals": {
						for (const cond of modMeta.conditionals) {
							// If there is no condition (i.e. this is the "else" branch), always run.
							//   Otherwise, evaluate the condition.

							// Create a context for our variables to avoid any minification renames
							window.PLUT_CONTEXT = {actor};

							// eslint-disable-next-line no-eval
							if (cond.condition && !eval(cond.condition)) continue;

							Object.entries(cond.mod)
								.forEach(([path, modMetas]) => this._mutActorUpdate_mutFromSideMod_handleProp(actor, actorUpdate, opts, sideProp, actorProp, path, modMetas));

							break;
						}

						break;
					}

					default: throw new Error(`Unhandled mode "${modMeta.mode}"`);
				}
			});
			return;
		}

		const fromActor = MiscUtil.get(actor, "data", actorProp, ...pathParts);
		const fromUpdate = MiscUtil.get(actorUpdate, actorProp, ...pathParts);
		const existing = fromUpdate || fromActor;

		modMetas.forEach(modMeta => {
			switch (modMeta.mode) {
				case "appendStr": {
					const existing = MiscUtil.get(actorUpdate, actorProp, ...pathParts);
					const next = existing ? `${existing}${modMeta.joiner || ""}${modMeta.str}` : modMeta.str;
					MiscUtil.set(actorUpdate, actorProp, ...pathParts, next);
					break;
				}

				case "appendIfNotExistsArr": {
					const existingArr = MiscUtil.copy(existing || []);
					const out = [...existingArr];
					out.push(...modMeta.items.filter(it => !existingArr.some(x => CollectionUtil.deepEquals(it, x))));
					MiscUtil.set(actorUpdate, actorProp, ...pathParts, out);
					break;
				}

				case "scalarAdd": {
					MiscUtil.set(actorUpdate, actorProp, ...pathParts, modMeta.scalar + existing || 0);
					break;
				}

				case "scalarAddUnit": {
					const existingLower = `${existing || 0}`.toLowerCase();

					const handle = (toFind) => {
						const ix = existingLower.indexOf(toFind.toLowerCase());
						let numPart = existing.slice(0, ix);
						const rest = existing.slice(ix);
						const isSep = numPart.endsWith(" ");
						numPart = numPart.trim();

						if (!isNaN(numPart)) {
							const out = `${modMeta.scalar + Number(numPart)}${isSep ? " " : ""}${rest}`;
							MiscUtil.set(actorUpdate, actorProp, ...pathParts, out);
						} // else silently fail
					};

					if (!existing) MiscUtil.set(actorUpdate, actorProp, ...pathParts, `${modMeta.scalar} ${modMeta.unitShort || modMeta.unit}`);
					else if (modMeta.unit && existingLower.includes(modMeta.unit.toLowerCase())) {
						handle(modMeta.unit);
					} else if (modMeta.unitShort && existingLower.includes(modMeta.unitShort.toLowerCase())) {
						handle(modMeta.unitShort);
					} // else silently fail
					break;
				}

				// Set something to the numerical max of its existing value and the incoming value
				case "setMax": {
					const existingLower = `${existing || 0}`.toLowerCase();
					let asNum = Number(existingLower);
					if (isNaN(asNum)) asNum = 0;
					const maxValue = Math.max(asNum, modMeta.value);
					MiscUtil.set(actorUpdate, actorProp, ...pathParts, maxValue);
					break;
				}

				case "set": {
					MiscUtil.set(actorUpdate, actorProp, ...pathParts, MiscUtil.copy(modMeta.value));
					break;
				}

				default: throw new Error(`Unhandled mode "${modMeta.mode}"`);
			}
		});
	}

	static _getProfBonusExpressionParts (str) {
		// Get a list of parts of one of the forms:
		//  - `["1"]`
		//  - `["-1"]`
		//  - `["1", "+1"]`
		//  - `["-1", "-1"]`
		//  - `["-1", "+PB"]`
		const parts = str.split(/([-+]\s*[^-+]+)/g).map(it => it.trim().replace(/\s*/g, "")).filter(Boolean);

		const [partsNumerical, partsNonNumerical] = parts.segregate(it => !isNaN(it));

		const totalNumerical = partsNumerical.map(it => Number(it)).sum();

		return {partsNumerical, partsNonNumerical, totalNumerical};
	}

	static _PassiveEntryParseState = class {
		constructor ({entry, img, name}, opts) {
			this._entry = entry;
			this._opts = opts;

			this.name = name;
			this.img = img;

			// region Inputs
			let {
				description,

				activationType,
				activationCost,
				activationCondition,

				saveAbility,
				saveDc,
				saveScaling,

				damageParts,

				attackBonus,

				requirements,

				actionType,

				durationValue,
				durationUnits,

				consumeType,
				consumeTarget,
				consumeAmount,

				formula,

				targetValue,
				targetUnits,
				targetType,

				rangeShort,
				rangeLong,
				rangeUnits,

				ability,

				usesValue,
				usesMax,
				usesPer,

				isProficient,

				foundryData,
				_foundryData,
				foundryFlags,
				_foundryFlags,
			} = opts;

			this.combinedFoundryData = DataConverter.getCombinedFoundryData(foundryData, _foundryData);
			this.combinedFoundryFlags = DataConverter.getCombinedFoundryFlags(foundryFlags, _foundryFlags);

			this.description = description;

			this.activationType = activationType;
			this.activationCost = activationCost;
			this.activationCondition = activationCondition;

			this.saveAbility = saveAbility;
			this.saveDc = saveDc;
			this.saveScaling = saveScaling;

			this.damageParts = damageParts;

			this.attackBonus = attackBonus;

			this.requirements = requirements;

			this.actionType = actionType;

			this.durationValue = durationValue;
			this.durationUnits = durationUnits;

			this.consumeType = consumeType;
			this.consumeTarget = consumeTarget;
			this.consumeAmount = consumeAmount;

			this.formula = formula;

			this.targetValue = targetValue;
			this.targetUnits = targetUnits;
			this.targetType = targetType;

			this.rangeShort = rangeShort;
			this.rangeLong = rangeLong;
			this.rangeUnits = rangeUnits;

			this.ability = ability;

			this.usesValue = usesValue; // Number
			this.usesMax = usesMax; // String (can be a formula)
			this.usesPer = usesPer;

			this.isProficient = isProficient;
			// endregion

			// Effects added by the parsing process
			this.effectsParsed = [];

			// Flags added by the parsing process
			this.flagsParsed = {};
		}

		async pInit ({isSkipDescription = false, isSkipImg = false} = {}) {
			if (!isSkipDescription && !this.description && !this._opts.isSkipDescription) {
				this.description = await DataConverter.pGetEntryDescription(this._entry, {depth: this._opts.renderDepth, summonSpellLevel: this._opts.summonSpellLevel});
			}

			if (!isSkipImg && this._opts.img) {
				this.img = await Vetools.pOptionallySaveImageToServerAndGetUrl(this._opts.img);
			}
		}
	};

	/**
	 * Generic entry -> item data parsing.
	 * @param entry Entry to process.
	 * @param opts Options object.
	 * @param opts.mode Parsing mode; `"creature"` or `"player" or "object"`.
	 * @param [opts.modeOptions] Parsing mode options.
	 * @param opts.fvttType Foundry type.
	 * @param opts.img Image path.
	 *
	 * @param [opts.renderDepth] Render depth.
	 *
	 * @param [opts.displayName] Item display name.
	 *
	 * @param [opts.source] Item source.
	 * @param [opts.fvttSource] Predefined item source (e.g. with page info already included)
	 * @param [opts.page] Item page.
	 *
	 * @param [opts.activationType] Foundry activation type.
	 * @param [opts.activationCost] Foundry activation cost.
	 * @param [opts.activationCondition] Foundry activation condition.
	 * @param [opts.consumeType]
	 * @param [opts.consumeTarget]
	 * @param [opts.consumeAmount]
	 * @param [opts.formula]
	 * @param [opts.ability]
	 *
	 * @param [opts.description] Pre-rendered description.
	 * @param [opts.isSkipDescription] If a description should not be created from the entry.
	 *
	 * @param [opts.actor] Actor data.
	 *
	 * @param [opts.summonSpellLevel] Spell level used to summon the creature this item will belong to, if appropriate.
	 *
	 * @param [opts.additionalData] Additional side-loaded Foundry data.
	 * @param [opts.additionalFlags] Additional side-loaded Foundry flags.
	 * @param [opts.effects] Item effects.
	 *
	 * @param [opts.pb] A proficiency bonus for this actor. Used for creature text parsing.
	 * @param [opts.entity] An entity with str/dex/con/int/wis/cha scores. Used for creature text parsing.
	 * @param [opts.entity.str]
	 * @param [opts.entity.dex]
	 * @param [opts.entity.con]
	 * @param [opts.entity.int]
	 * @param [opts.entity.wis]
	 * @param [opts.entity.cha]
	 *
	 * @param [opts.foundryData]
	 * @param [opts._foundryData]
	 * @param [opts.foundryFlags]
	 * @param [opts._foundryFlags]
	 */
	static async pGetItemActorPassive (entry, opts) {
		opts = opts || {};
		opts.modeOptions = opts.modeOptions || {};

		// Treat object parses as creature parses; potentially to be reworked in the future.
		if (opts.mode === "object") opts.mode = "creature";

		const state = new this._PassiveEntryParseState(
			{
				entry,
				name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(entry, {displayName: opts.displayName, isActorItem: true})),
			},
			opts,
		);
		await state.pInit();

		const strEntries = entry.entries ? JSON.stringify(entry.entries) : null;

		// region Recharge
		let rechargeOn = null;
		if (entry.name) {
			const mRecharge = /{@recharge( \d+)?}/gi.exec(entry.name);
			if (mRecharge) {
				rechargeOn = mRecharge[1] ? Number(mRecharge[1].trim()) : 6;
				state.name = state.name
					.replace(/\(Recharge \d+(–\d+)?\)/gi, "")
					.trim()
					.replace(/[ ]+/g, " ")
				;
			}
		}
		// endregion

		this._pGetItemActorPassive_mutActivation({entry, opts, state});

		this._pGetItemActorPassive_mutUses({entry, opts, strEntries, state});

		this._pGetItemActorPassive_mutSave({entry, opts, strEntries, state});

		// region Duration
		if (opts.mode === "player" && entry.entries) {
			UtilDataConverter.WALKER_READONLY_GENERIC.walk(
				entry.entries,
				{
					string: (str) => {
						// Only update the duration if we can set both units and value
						if (state.durationValue || state.durationUnits) return;

						// "lasts for 1 minute"
						// "lasts for 8 hours"
						str.replace(/(?:^|\W)lasts for (\d+) (minute|hour|day|month|year|turn|round)s?(?:\W|$)/gi, (...m) => {
							state.durationValue = Number(m[1]);
							state.durationUnits = m[2].toLowerCase();
						});

						// "for the next 8 hours"
						str.replace(/(?:^|\W)for the next (\d+) (minute|hour|day|month|year|turn|round)s?(?:\W|$)/gi, (...m) => {
							state.durationValue = Number(m[1]);
							state.durationUnits = m[2].toLowerCase();
						});

						// "turned for 1 minute" (e.g. channel divinity)
						str.replace(/(?:^|\W)turned for (\d+) (minute|hour|day|month|year|turn|round)s?(?:\W|$)/gi, (...m) => {
							state.durationValue = Number(m[1]);
							state.durationUnits = m[2].toLowerCase();
						});

						// "this effect lasts for 1 minute"
						str.replace(/(?:^|\W)this effect lasts for (\d+) (minute|hour|day|month|year|turn|round)s?(?:\W|$)/gi, (...m) => {
							state.durationValue = Number(m[1]);
							state.durationUnits = m[2].toLowerCase();
						});

						// "until the end of your next turn"
						str.replace(/(?:^|\W)until the end of your next turn(?:\W|$)/gi, () => {
							state.durationValue = 1;
							state.durationUnits = "turn";
						});

						// "it is charmed by you for 1 minute"
						Renderer.stripTags(str).replace(/(?:^|\W)is \w+ by you for (\d+) (minute|hour|day|month|year|turn|round)s(?:\W|$)/gi, (...m) => {
							state.durationValue = Number(m[1]);
							state.durationUnits = m[2].toLowerCase();
						});
					},
				},
			);
		}
		// endregion

		// region Damage
		let strEntriesNoDamageDice = strEntries;
		if ((opts.mode === "player" || opts.mode === "vehicle") && entry.entries && !state.damageParts?.length) {
			const {str, damageTupleMetas} = DataConverter.getDamageTupleMetas(strEntries, {summonSpellLevel: opts.summonSpellLevel});
			strEntriesNoDamageDice = str;

			const {damageParts: damageParts_, formula: formula_} = DataConverter.getDamagePartsAndOtherFormula(damageTupleMetas);

			state.damageParts = damageParts_;
			state.formula = state.formula ?? formula_;
		}
		// endregion

		// region Other Formulas
		if ((opts.mode === "player" || opts.mode === "vehicle") && entry.entries && state.formula == null) {
			// Note: not `[g]lobal`, as only one "other formula" is supported
			strEntriesNoDamageDice.replace(/{(?:@dice|@scaledice) ([^|}]+)(?:\|[^}]+)?}/i, (...m) => {
				const [dice] = m[1].split("|");
				state.formula = dice;
			});
		}
		// endregion

		// region Target
		if (opts.mode === "creature" && strEntries && !state.targetValue && !state.targetUnits && !state.targetType) {
			const targetMeta = this._pGetItemActorPassive_getTargetMeta(strEntries);
			state.targetValue = targetMeta.targetValue || state.targetValue;
			state.targetUnits = targetMeta.targetUnits || state.targetUnits;
			state.targetType = targetMeta.targetType || state.targetType;
		}
		// endregion

		// region Action type
		this._pGetItemActorPassive_mutActionType({entry, opts, state});
		// endregion

		this._pGetItemActorPassive_mutEffects({entry, opts, state});

		// region Post-processing
		try { state.activationCondition = Renderer.stripTags(state.activationCondition); } catch (e) { console.error(...LGT, e); }

		// Ensure the item is displayed as an active, with uses, if we have consume/use data
		if (
			(
				state.consumeType
				|| state.usesPer
				|| opts.additionalData?.["consume.type"]
				|| opts.additionalData?.consume?.type
				|| opts.additionalData?.["uses.per"]
				|| opts.additionalData?.uses?.per
			)
			&& !state.activationType
		) state.activationType = "special";
		// endregion

		state.name = state.name.trim().replace(/\s+/g, " ");
		if (!state.name) state.name = "(Unnamed)"; // Empty names are invalid in Foundry

		const fauxEntrySourcePage = {...entry};
		if (opts.source != null) fauxEntrySourcePage.source = opts.source;
		if (opts.page != null) fauxEntrySourcePage.page = opts.page;

		this._pGetItemActorPassive_mutFlags({entry, opts, state});

		return {
			name: state.name,
			type: opts.fvttType || "feat",
			data: {
				source: opts.fvttSource !== undefined ? opts.fvttSource : UtilDataConverter.getSourceWithPagePart(fauxEntrySourcePage),
				description: {value: state.description, chat: "", unidentified: ""},

				damage: {
					parts: state.damageParts ?? [],
					versatile: "",
				},
				duration: {
					value: state.durationValue,
					units: state.durationUnits,
				},
				range: {
					value: state.rangeShort,
					long: state.rangeLong,
					units: state.rangeUnits || ((state.rangeShort != null || state.rangeLong != null) ? "ft" : ""),
				},
				proficient: state.isProficient,
				requirements: state.requirements,

				save: {
					ability: state.saveAbility,
					dc: state.saveDc,
					scaling: state.saveScaling || "flat",
				},

				activation: {
					type: state.activationType,
					cost: state.activationCost,
					condition: state.activationCondition,
				},

				target: {
					value: state.targetValue,
					units: state.targetUnits,
					type: state.targetType,
				},

				uses: {
					value: state.usesValue,
					max: state.usesMax,
					per: state.usesPer,
				},
				ability: state.ability,
				actionType: state.actionType,
				attackBonus: state.attackBonus,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},

				formula: state.formula,

				recharge: {
					value: rechargeOn,
					charged: rechargeOn != null,
				},

				consume: {
					type: state.consumeType,
					target: state.consumeTarget,
					amount: state.consumeAmount,
				},

				...(state.combinedFoundryData || {}),
				...(opts.additionalData || {}),
			},
			img: state.img,
			flags: {
				...state.flagsParsed,
				...(UtilCompat.getFeatureFlags({isReaction: ["reaction", "reactiondamage", "reactionmanual"].includes(state.activationType)})),
				...(state.combinedFoundryFlags || {}),
				...opts.additionalFlags,
			},
			effects: [
				...(opts.effects || []),
				...state.effectsParsed,
			],
		};
	}

	static _pGetItemActorPassive_mutActivation ({entry, opts, state}) {
		this._pGetItemActorPassive_mutActivation_player({entry, opts, state});
		this._pGetItemActorPassive_mutActivation_creature({entry, opts, state});
	}

	static _pGetItemActorPassive_mutActivation_player ({entry, opts, state}) {
		if (opts.mode !== "player" || !entry.entries?.length) return;

		if (state.activationType || state.activationCost) {
			this._pGetItemActorPassive_mutActivation_playerCompat({entry, opts, state});
			return;
		}

		let isAction = false;
		let isBonusAction = false;
		let isReaction = false;

		UtilDataConverter.WALKER_READONLY_GENERIC.walk(
			entry.entries,
			{
				string: (str) => {
					if (state.activationType) return str;

					const sentences = Util.getSentences(str);
					for (const sentence of sentences) {
						if (/\b(?:as an action|can take an action|can use your action)\b/i.test(sentence)) {
							isAction = true;
							break;
						}

						if (/\bbonus action\b/i.test(sentence)) {
							isBonusAction = true;
							break;
						}

						const mReact = /\b(?:your reaction|this special reaction|as a reaction)\b/i.exec(sentence);
						if (mReact) {
							isReaction = true;

							// Attempt to pull out a condition from the preceding text, e.g.
							// "When an enemy within 30 feet of you, ..., you can use your reaction"
							let preceding = sentence.slice(0, mReact.index).trim().replace(/,$/, "");
							const mCondition = /(^|\W)(?:if|when)(?:|\W)/i.exec(preceding);
							if (mCondition) {
								preceding = preceding.slice(mCondition.index + mCondition[1].length).trim();
								state.activationCondition = state.activationCondition || preceding;
							}

							break;
						}
					}
				},
			},
		);

		// Prefer action -> bonus action -> reaction, as some actions (e.g. Tortle's "Shell Defense" have 'bonus
		//   action to end' clauses.
		if (isAction) state.activationType = "action";
		else if (isBonusAction) state.activationType = "bonus";
		else if (isReaction) state.activationType = "reaction";

		if (state.activationType) state.activationCost = 1;

		// If we could not find a well-defined action type, fall back on "special" in some cases
		if (!state.activationType) {
			UtilDataConverter.WALKER_READONLY_GENERIC.walk(
				entry.entries,
				{
					string: (str) => {
						if (state.activationType) return str;

						const sentences = Util.getSentences(str);

						for (const sentence of sentences) {
							if (/you can't use this feature again|once you use this feature/i.test(sentence)) state.activationType = "special";
						}
					},
				},
			);
		}

		this._pGetItemActorPassive_mutActivation_playerCompat({entry, opts, state});
	}

	static _pGetItemActorPassive_mutActivation_creature ({entry, opts, state}) {
		if (opts.mode !== "creature" || !entry.entries?.length || !entry.name) return;

		if (state.activationType || state.activationCost) {
			this._pGetItemActorPassive_mutActivation_creatureCompat({entry, opts, state});
			return;
		}

		MiscUtil.getWalker({
			isNoModification: true,
			keyBlocklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLOCKLIST,
			isBreakOnReturn: true,
		}).walk(
			entry.entries,
			{
				string: str => {
					if (/\bbonus action\b/i.test(str)) {
						state.activationType = "bonus";
						state.activationCost = 1;
						return true;
					}
				},
			},
		);

		if (/^legendary resistance/i.test(entry.name)) {
			state.activationType = "special";
		}

		this._pGetItemActorPassive_mutActivation_creatureCompat({entry, opts, state});
	}

	static _pGetItemActorPassive_mutActivation_playerCompat ({entry, opts, state}) {
		if (!UtilCompat.isMidiQolActive() || state.activationType !== "reaction") return null;

		// Classify reactions as "reacting to damage" or "manual" if Midi-QOL is active
		// TODO(Future; PAD) Find some good examples and implement
	}

	static _pGetItemActorPassive_mutActivation_creatureCompat ({entry, opts, state}) {
		if (!UtilCompat.isMidiQolActive() || state.activationType !== "reaction") return;

		// If Midi-QOL is active, default to "manual reaction"
		state.activationType = "reactionmanual";

		// Only use the first entry, as the others may e.g. be a table of effects
		let firstEntry = entry.entries[0];
		if (typeof firstEntry !== "string") return;

		firstEntry
			// Do this first, as a general catch-all
			.replace(/\bcauses the attack to miss\b/i, () => {
				state.activationType = "reaction";
				return "";
			})

			.replace(/\badds? (?<ac>\d+) to (its|their|his|her) AC\b/i, (...m) => {
				const argsDuration = UtilCompat.isDaeActive()
					? {flags: {[UtilCompat.MODULE_DAE]: {specialDuration: ["1Reaction"]}}}
					: {durationTurns: 1};

				state.effectsParsed.push(UtilActiveEffects.getGenericEffect({
					...argsDuration,
					key: `data.attributes.ac.bonus`,
					value: Number(m.last().ac),
					mode: CONST.ACTIVE_EFFECT_MODES.ADD,
					label: `${entry.name}`,
					icon: state.img,
					disabled: false,
					transfer: false,
					priority: UtilActiveEffects.PRIORITY_BONUS,
				}));

				state.targetType = state.targetType || "self";

				return "";
			})

			.replace(/\battack that would (?:hit|miss) (?:it|them|him|her|or miss)\b/i, () => {
				state.activationType = "reaction";
				return "";
			})
			.replace(/\bin response to being (?:hit|missed)\b/i, () => {
				state.activationType = "reaction";
				return "";
			})

			.replace(/\bafter taking damage from\b/i, () => {
				state.activationType = "reactiondamage";
				return "";
			})
			.replace(/\bIf [^.!?:]+ takes damage(?:,| while it)\b/i, () => {
				state.activationType = "reactiondamage";
				return "";
			})
			.replace(/\bIn response to taking damage\b/i, () => {
				state.activationType = "reactiondamage";
				return "";
			})
		;
	}

	static _pGetItemActorPassive_mutSave ({entry, opts, strEntries, state}) {
		this._pGetItemActorPassive_mutSave_player({entry, opts, strEntries, state});
		this._pGetItemActorPassive_mutSave_creature({entry, opts, strEntries, state});
	}

	static _pGetItemActorPassive_mutSave_player ({entry, opts, strEntries, state}) {
		if (opts.mode !== "player" || !entry.entries?.length) return;

		UtilDataConverter.WALKER_READONLY_GENERIC.walk(
			entry.entries,
			{
				object: (obj) => {
					if (obj.type !== "abilityDc") return obj;

					if (state.actionType && state.saveScaling) return obj;

					state.actionType = state.actionType || "save";
					state.saveScaling = obj.attributes[0]; // Use the first available attribute

					return obj;
				},
				string: (str) => {
					if (state.actionType && state.saveAbility && state.saveScaling) return str;

					// region "8 + pb + mod"
					str.replace(/8\s*\+\s*your proficiency bonus\s*\+\s*your (.*?) modifier/i, (...m) => {
						const customAbilities = [];
						m[1].replace(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i, (...m2) => {
							customAbilities.push(m2[1].toLowerCase().slice(0, 3));
						});
						if (!customAbilities.length) return;

						state.actionType = state.actionType || "save";
						state.saveScaling = customAbilities[0]; // Use the first available attribute
					});
					// endregion

					// region Spell save
					// e.g.:
					// - "succeed on a Wisdom saving throw against your spell save DC"
					str.replace(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw against your (.*? )spell save DC/i, (...m) => {
						state.actionType = state.actionType || "save";
						state.saveAbility = state.saveAbility || m[1].toLowerCase().slice(0, 3);
						state.saveScaling = state.saveScaling || "spell";
					});
					// endregion

					str.replace(/(?:make a|succeed on a) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/gi, (...m) => {
						state.actionType = state.actionType || "save";
						state.saveAbility = state.saveAbility || m[1].toLowerCase().slice(0, 3);
						state.saveScaling = state.saveScaling || "spell";
					});

					return str;
				},
			},
		);
	}

	static _pGetItemActorPassive_mutSave_creature ({entry, opts, strEntries, state}) {
		if (opts.mode !== "creature" || !entry.entries?.length) return;

		// If a "passive" text feature has one or more DCs embedded, use the first as the save DC info.
		const m = /{@dc (?<save>[^|}]+)(?:\|[^}]+)?}\s+(?<abil>Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i.exec(strEntries);
		if (!m) return;

		const {partsNonNumerical, totalNumerical} = this._getProfBonusExpressionParts(m.groups.save);

		state.actionType = state.actionType || "save";
		state.saveAbility = state.saveAbility || m.groups.abil.toLowerCase().slice(0, 3);
		state.saveDc = totalNumerical; // FIXME(Future) Unfortunately, dnd5e (as of 2022-03-23) does not support expressions/etc. in this field, so we have to use the number

		if (partsNonNumerical.length || opts.pb == null || opts.entity == null || Parser.ABIL_ABVS.some(it => opts.entity[it] == null)) {
			state.saveScaling = "flat";
			return;
		}

		// If there is exactly one ability score that our saving throw could be based on, use it,
		//   rather than flat scaling.
		const fromAbil = state.saveDc - opts.pb - 8;
		const abilToBonus = Parser.ABIL_ABVS.map(it => ({ability: it, bonus: Parser.getAbilityModNumber(opts.entity[it])}));
		const matchingAbils = abilToBonus.filter(it => it.bonus === fromAbil);

		if (matchingAbils.length === 1) state.saveScaling = state.saveScaling || matchingAbils[0].ability;
		else state.saveScaling = "flat";
	}

	static _pGetItemActorPassive_mutUses ({entry, opts, strEntries, state}) {
		this._pGetItemActorPassive_mutUses_creature({entry, opts, strEntries, state});
		this._pGetItemActorPassive_mutUses_player({entry, opts, strEntries, state});
	}

	static _pGetItemActorPassive_mutUses_creature ({entry, opts, strEntries, state}) {
		// For creatures, use information is given in the name
		if (opts.mode !== "creature" || !entry.name) return;

		// Avoid adding usage info to legendary resistances, as they will be tracked as resource usage on the sheet
		const isLegendary = /legendary resistance/gi.test(state.name);

		let isFound = false;

		state.name = state.name
			.replace(/\(Recharges after a (?<restPart>[^)]+)\)/i, (...m) => {
				isFound = true;

				if (isLegendary) return "";

				if (state.usesValue === undefined) state.usesValue = 1;
				if (state.usesMax === undefined) state.usesMax = `${state.usesValue}`;

				const restPartClean = m.last().restPart.toLowerCase();
				if (/\bshort\b/.test(restPartClean)) {
					if (state.usesPer === undefined) state.usesPer = "sr";
				} else if (/\blong\b/.test(restPartClean)) {
					if (state.usesPer === undefined) state.usesPer = "lr";
				}

				return "";
			});

		if (state.usesPer === undefined) {
			state.name = state.name.replace(/\(\s*(\d+)\s*\/\s*(Day|Short Rest|Long Rest)\s*\)/i, (...m) => {
				isFound = true;

				if (isLegendary) return "";

				if (state.usesValue === undefined) state.usesValue = Number(m[1]);
				if (state.usesMax === undefined) state.usesMax = `${state.usesValue}`;

				if (state.usesPer === undefined) {
					const cleanTime = m[2].trim().toLowerCase();
					switch (cleanTime) {
						case "day": state.usesPer = "day"; break;
						case "short rest": state.usesPer = "sr"; break;
						case "long rest": state.usesPer = "lr"; break;
					}
				}

				return "";
			});
		}

		if (state.usesPer === undefined) {
			state.name = state.name.replace(/\(\s*(\d+)\s+Charges\s*\)/i, (...m) => {
				isFound = true;

				if (isLegendary) return "";

				if (state.usesValue === undefined) state.usesValue = Number(m[1]);
				if (state.usesMax === undefined) state.usesMax = `${state.usesValue}`;
				if (state.usesPer === undefined) state.usesPer = "charges";

				return "";
			});
		}

		if (!isFound) return;

		// Clean the name after doing any replaces
		state.name = state.name.trim().replace(/ +/g, " ");

		// Force an activation cost if we have an activation cost, as it is required to display the form correctly
		if (state.activationType === undefined) state.activationType = state.activationType || "none";

		// If the first line of the entries starts with "If ..." or "When ...", use the first line as the condition
		if (entry.entries && typeof entry.entries[0] === "string" && /^(?:If |When )/i.test(entry.entries[0].trim())) {
			if (state.activationCondition === undefined) state.activationCondition = entry.entries[0].trim();
		}
	}

	static _pGetItemActorPassive_mutUses_player ({entry, opts, strEntries, state}) {
		if (opts.mode !== "player" || !entry.entries) return;

		// If we have pre-defined "consumes item" data, skip setting use info, as we assume the parent item will contain this information
		if (state.consumeType === "charges") return;

		// region Resting
		const isShortRest = /\b(?:finish|complete) a short rest\b/.test(strEntries) || /\b(?:finish|complete) a short or long rest\b/.test(strEntries) || /\b(?:finish|complete) a short rest or a long rest\b/.test(strEntries) || /\b(?:finish|complete) a short or long rest\b/.test(strEntries);
		const isLongRest = !isShortRest && /\b(?:finish|complete) a long rest\b/.test(strEntries);

		if (state.usesPer === undefined) {
			if (isShortRest) state.usesPer = "sr";
			else if (isLongRest) state.usesPer = "lr";
		}
		// endregion

		// region Uses
		const mAbilModifier = new RegExp(`a number of times equal to(?: (${Consts.TERMS_COUNT.map(it => it.tokens.join("")).join("|")}))? your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier(?: \\(minimum of (${Consts.TERMS_COUNT.map(it => it.tokens.join("")).join("|")})\\))?`, "i").exec(strEntries);
		if (mAbilModifier && opts.actor) {
			const abv = mAbilModifier[2].slice(0, 3).toLowerCase();
			const abilScore = MiscUtil.get(opts.actor, "data", "data", "abilities", abv, "value");
			if (abilScore != null) {
				let mod = Parser.getAbilityModNumber(abilScore);
				// FIXME(Future) Test/use the proper version when dnd5e 1.3.0 is released
				// let modFormula = `@abilities.${abv}.mod`;
				let modFormula = `floor((@abilities.${abv}.value - 10) / 2)`;

				if (mAbilModifier[1]) {
					const multiplier = (Consts.TERMS_COUNT.find(it => it.tokens.join(" ") === mAbilModifier[1].trim().toLowerCase()) || {}).count || 1;
					mod = mod * multiplier;
					modFormula = `${modFormula} * ${multiplier}`;
				}

				if (mAbilModifier[3]) {
					const min = (Consts.TERMS_COUNT.find(it => it.tokens.join("") === mAbilModifier[3].trim().toLowerCase()) || {}).count || 1;
					mod = Math.max(min, mod);
					modFormula = `max(${min}, ${modFormula})`;
				}

				if (state.usesValue === undefined) state.usesValue = mod;
				if (state.usesMax === undefined) state.usesMax = modFormula;
			}
		}

		strEntries.replace(/you can use ([^.!?]+) a number of times equal to(?<mult> twice)? your proficiency bonus/i, (...m) => {
			const mult = m.last().mult
				? (Consts.TERMS_COUNT.find(meta => CollectionUtil.deepEquals(meta.tokens, m.last().mult.trim().toLowerCase().split(/( )/g)))?.count || 1)
				: 1;
			if (state.usesValue === undefined) state.usesValue = opts.actor ? (opts.actor.getRollData().prof * mult) : null;
			if (state.usesMax === undefined) state.usesMax = `@prof${mult > 1 ? ` * ${mult}` : ""}`;
		});

		strEntries.replace(/you can use this (?:feature|ability) (?<mult>once|twice|[a-zA-Z]+ times)/i, (...m) => {
			const mult = (Consts.TERMS_COUNT.find(meta => CollectionUtil.deepEquals(meta.tokens, m.last().mult.trim().toLowerCase().split(/( )/g)))?.count || 1);
			if (state.usesValue === undefined) state.usesValue = mult;
			if (state.usesMax === undefined) state.usesMax = mult;
		});

		// If we found no use count, assume it's one-use
		if (state.usesPer && !state.usesValue && (!state.usesMax || state.usesMax === "0")) {
			if (state.usesValue === undefined) state.usesValue = 1;
			if (state.usesMax === undefined) state.usesMax = `${state.usesValue}`;
		}
		// endregion
	}

	static _pGetItemActorPassive_getTargetMeta (strEntries) {
		let targetValue, targetUnits, targetType;
		let found = false;

		let tmpEntries = strEntries
			// Dragon breath weapons; abominable yeti breath weapon
			.replace(/exhales [^.]*a (?<size>\d+)-foot[- ](?<shape>cone|line)/, (...m) => {
				targetValue = Number(m.last().size);
				targetUnits = "ft";
				targetType = m.last().shape; // "cone" and "line" are both valid values

				found = true;

				return "";
			});

		if (found) return {targetValue, targetUnits, targetType};

		// e.g. Djinni "Create Whirlwind"
		tmpEntries = tmpEntries.replace(/(?<size>\d+)-foot-radius,? \d+-foot-tall cylinder/, (...m) => {
			targetValue = Number(m.last().size);
			targetUnits = "ft";
			targetType = "cylinder";

			found = true;
			return "";
		});

		if (found) return {targetValue, targetUnits, targetType};

		// e.g.:
		// - Azer "Illumination"
		// - Beholder variant "Death Ray"
		tmpEntries = tmpEntries.replace(/(?<size>\d+)-foot[- ]radius(?<ptSphere> sphere)?/, (...m) => {
			targetValue = Number(m.last().size);
			targetUnits = "ft";
			targetType = (m.last().ptSphere ? "sphere" : "radius");

			found = true;
			return "";
		});

		if (found) return {targetValue, targetUnits, targetType};

		// e.g. Beholder "Disintegration Ray"
		tmpEntries = tmpEntries.replace(/(?<size>\d+)-foot[- ]cube/, (...m) => {
			targetValue = Number(m.last().size);
			targetUnits = "ft";
			targetType = "cube";

			found = true;
			return "";
		});

		if (found) return {targetValue, targetUnits, targetType};

		// e.g. Beholder variant "Petrification Ray"
		tmpEntries = tmpEntries.replace(/(?<size>\d+)-foot[- ]square/, (...m) => {
			targetValue = Number(m.last().size);
			targetUnits = "ft";
			targetType = "square";

			found = true;
			return "";
		});

		if (found) return {targetValue, targetUnits, targetType};

		// e.g. Marid "Water Jet"
		tmpEntries = tmpEntries.replace(/(?<size>\d+)-foot line/, (...m) => {
			targetValue = Number(m.last().size);
			targetUnits = "ft";
			targetType = "line";

			found = true;
			return "";
		});

		// e.g. Mind Flayer "Mind Blast"
		tmpEntries = tmpEntries.replace(/(?<size>\d+)-foot cone/, (...m) => {
			targetValue = Number(m.last().size);
			targetUnits = "ft";
			targetType = "cone";

			found = true;
			return "";
		});

		if (found) return {targetValue, targetUnits, targetType};
		return {};
	}

	static _pGetItemActorPassive_mutActionType ({entry, opts, state}) {
		this._pGetItemActorPassive_mutActionType_player({entry, opts, state});
		this._pGetItemActorPassive_mutActionType_creature({entry, opts, state});
	}

	static _pGetItemActorPassive_mutActionType_player ({entry, opts, state}) {
		if (state.actionType || opts.mode !== "player" || !entry.entries?.length) return;

		const walker = MiscUtil.getWalker({keyBlocklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLOCKLIST, isNoModification: true, isBreakOnReturn: true});
		walker.walk(
			entry.entries,
			{
				string: str => {
					const mMeleeRangedWeaponAttack = /you\b[^.!?]*\bmake a (?<type>melee|ranged) weapon attack/i.exec(str);
					if (mMeleeRangedWeaponAttack) {
						state.actionType = mMeleeRangedWeaponAttack.groups.type.toLowerCase() === "melee" ? "mwak" : "rwak";
						return true;
					}

					const mMeleeRangedSpellAttack = /you\b[^.!?]*\bmake a (?<type>melee|ranged) spell attack/i.exec(str);
					if (mMeleeRangedSpellAttack) {
						state.actionType = mMeleeRangedSpellAttack.groups.type.toLowerCase() === "melee" ? "msak" : "rsak";
						return true;
					}

					const mHeal = /creature\b[^.!?]*\bregains\b[^.!?]*\bhit points?/i.exec(str);
					if (mHeal) {
						state.actionType = "heal";
						return true;
					}
				},
			},
		);

		state.actionType = state.actionType || "other";
	}

	static _pGetItemActorPassive_mutActionType_creature ({entry, opts, state}) {
		if (state.actionType || opts.mode !== "creature" || !entry.entries?.length) return;

		state.actionType = "other";
	}

	static _pGetItemActorPassive_mutEffects ({entry, opts, state}) {
		this._pGetItemActorPassive_mutEffects_player({entry, opts, state});
		this._pGetItemActorPassive_mutEffects_creature({entry, opts, state});
	}

	static _pGetItemActorPassive_mutEffects_player ({entry, opts, state}) {
		if (opts.mode !== "player" || !entry.entries?.length) return;

		// (Expand this as required)
		void 0;
	}

	static _pGetItemActorPassive_mutEffects_creature ({entry, opts, state}) {
		if (opts.mode !== "creature" || !entry.entries?.length) return;

		// Only add effects if we're using automation
		if (!UtilCompat.isPlutoniumAddonAutomationActive()) return;

		const effects = UtilAutomation.getCreatureFeatureEffects({entry, img: state.img, entity: opts.entity});
		if (effects.length) state.effectsParsed.push(...effects);
	}

	static _pGetItemActorPassive_mutFlags ({entry, opts, state}) {
		this._pGetItemActorPassive_mutFlags_player({entry, opts, state});
		this._pGetItemActorPassive_mutFlags_creature({entry, opts, state});
	}

	static _pGetItemActorPassive_mutFlags_player ({entry, opts, state}) {
		if (opts.mode !== "player" || !entry.entries?.length) return;

		// (Expand this as required)
		void 0;
	}

	static _pGetItemActorPassive_mutFlags_creature ({entry, opts, state}) {
		if (opts.mode !== "creature" || !entry.entries?.length) return;

		if (!UtilCompat.isMidiQolActive()) return;

		MiscUtil.getWalker({
			isNoModification: true,
			keyBlocklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLOCKLIST,
			isBreakOnReturn: true,
		}).walk(
			entry.entries,
			{
				string: str => {
					if (/\buntil [^.?!]+ concentration ends\b/i.test(str)) {
						MiscUtil.set(state.flagsParsed, "midiProperties", "concentration", true);
						return true;
					}
				},
			},
		);
	}

	static getMaxCasterProgression (...casterProgressions) {
		casterProgressions = casterProgressions.filter(Boolean);
		const ixs = casterProgressions.map(it => this._CASTER_PROGRESSIONS.indexOf(it)).filter(ix => ~ix);
		if (!ixs.length) return null;
		return this._CASTER_PROGRESSIONS[Math.min(...ixs)];
	}

	static getMaxCantripProgression (...casterProgressions) {
		const out = [];
		casterProgressions
			.filter(Boolean)
			.forEach(progression => {
				progression.forEach((cnt, i) => {
					if (out[i] == null) return out[i] = cnt;
					out[i] = Math.max(out[i], cnt);
				});
			});
		return out;
	}

	/**
	 * @param existingProficienciesSkills Actor's current skill proficiencies.
	 * @param existingProficienciesTools Actor's current tool proficiencies.
	 * @param existingProficienciesLanguages Actor's current languages.
	 * @param skillProficiencies Data from a background or race.
	 * @param languageProficiencies Data from a background or race.
	 * @param toolProficiencies Data from a background or race.
	 * @param skillToolLanguageProficiencies Data from a background or race.
	 * @param actorData Actor update object to fill.
	 * @param importOpts
	 * @param [titlePrefix]
	 */
	static async pFillActorSkillToolLanguageData (
		{
			existingProficienciesSkills,
			existingProficienciesTools,
			existingProficienciesLanguages,
			skillProficiencies,
			languageProficiencies,
			toolProficiencies,
			skillToolLanguageProficiencies,
			actorData,
			importOpts,
			// Other options
			titlePrefix,
		},
	) {
		skillToolLanguageProficiencies = this._pFillActorSkillToolLanguageData_getMergedProfs({
			skillProficiencies,
			languageProficiencies,
			toolProficiencies,
			skillToolLanguageProficiencies,
		});

		const formData = await Charactermancer_OtherProficiencySelect.pGetUserInput({
			titlePrefix,
			existingFvtt: {
				skillProficiencies: existingProficienciesSkills,
				toolProficiencies: existingProficienciesTools,
				languageProficiencies: existingProficienciesLanguages,
			},
			available: skillToolLanguageProficiencies,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplySkillFormDataToActorUpdate({
			existingProfsActor: existingProficienciesSkills,
			formData,
			actorData,
		});

		this.doApplyOtherProficienciesFormData({
			existingProfsActor: existingProficienciesLanguages,
			formData,
			formDataProp: "languageProficiencies",
			actorData,
			opts: {
				fnGetMappedItem: it => UtilActors.getMappedLanguage(it),
				actorTraitProp: "languages",
			},
		});

		this.doApplyOtherProficienciesFormData({
			existingProfsActor: existingProficienciesTools,
			formData,
			formDataProp: "toolProficiencies",
			actorData,
			opts: {
				fnGetMappedItem: it => UtilActors.getMappedTool(it),
				actorTraitProp: "toolProf",
			},
		});
		// endregion
	}

	// TODO expand this and use for e.g. armor and weapon profs too
	static _pFillActorSkillToolLanguageData_getMergedProfs (
		{
			skillProficiencies,
			languageProficiencies,
			toolProficiencies,
			skillToolLanguageProficiencies,
		},
	) {
		const hasAnySingles = skillProficiencies?.length || languageProficiencies?.length || toolProficiencies?.length;
		if (!hasAnySingles) return skillToolLanguageProficiencies;

		if (!skillToolLanguageProficiencies?.length) {
			const out = [];
			this._pFillActorSkillToolLanguageData_doMergeToSingleArray({
				targetArray: out,
				skillProficiencies,
				languageProficiencies,
				toolProficiencies,
			});
			return out;
		}

		if (skillToolLanguageProficiencies?.length && hasAnySingles) console.warn(...LGT, `Founds individual skill/language/tool proficiencies alongside combined skill/language/tool; these will be merged together.`);

		const out = MiscUtil.copy(skillToolLanguageProficiencies || []);
		this._pFillActorSkillToolLanguageData_doMergeToSingleArray({
			targetArray: out,
			skillProficiencies,
			languageProficiencies,
			toolProficiencies,
		});
		return out;
	}

	static _pFillActorSkillToolLanguageData_doMergeToSingleArray (
		{
			targetArray,
			skillProficiencies,
			languageProficiencies,
			toolProficiencies,
		},
	) {
		const maxLen = Math.max(
			targetArray?.length || 0,
			skillProficiencies?.length || 0,
			languageProficiencies?.length || 0,
			toolProficiencies?.length || 0,
		);
		for (let i = 0; i < maxLen; ++i) {
			const tgt = (targetArray[i] = {});

			const skillProfSet = skillProficiencies?.[i];
			const langProfSet = languageProficiencies?.[i];
			const toolProfSet = toolProficiencies?.[i];

			// region Skills
			if (skillProfSet) {
				this._pFillActorSkillToolLanguageData_doAddProfType({
					targetObject: tgt,
					profSet: skillProfSet,
					validKeySet: new Set(Object.keys(Parser.SKILL_TO_ATB_ABV)),
					anyKeySet: new Set(["any"]),
					anyKeySuffix: "Skill",
				});
			}
			// endregion

			// region Languages
			if (langProfSet) {
				this._pFillActorSkillToolLanguageData_doAddProfType({
					targetObject: tgt,
					profSet: langProfSet,
					anyKeySet: new Set(["any", "anyStandard"]),
					anyKeySuffix: "Language",
				});
			}
			// endregion

			// region Tools
			if (toolProfSet) {
				this._pFillActorSkillToolLanguageData_doAddProfType({
					targetObject: tgt,
					profSet: toolProfSet,
					anyKeySet: new Set(["any"]),
					anyKeySuffix: "Tool",
				});
			}
			// endregion
		}
	}

	static _pFillActorSkillToolLanguageData_doAddProfType (
		{
			targetObject,
			profSet,
			validKeySet,
			anyKeySet,
			anyKeySuffix,
		},
	) {
		Object.entries(profSet)
			.forEach(([k, v]) => {
				switch (k) {
					case "choose": {
						if (v?.from?.length) {
							const choose = MiscUtil.copy(v);
							choose.from = choose.from.filter(kFrom => !validKeySet || validKeySet.has(kFrom));
							if (choose.from.length) {
								const tgtChoose = (targetObject.choose = targetObject.choose || []);
								tgtChoose.push(choose);
							}
						}
						break;
					}

					default: {
						if (anyKeySet && anyKeySet.has(k)) {
							targetObject[`${k}${anyKeySuffix}`] = MiscUtil.copy(v);
							break;
						}

						if (!validKeySet || validKeySet.has(k)) targetObject[k] = MiscUtil.copy(v);
					}
				}
			});
	}

	/**
	 * @param existingProfsActor Existing skill data.
	 * @param skillProficiencies Data from a background or race.
	 * @param actorData Actor update object to fill.
	 * @param importOpts
	 * @param [opts] Options
	 * @param [opts.titlePrefix]
	 * @return {Promise<object>}
	 */
	static async pFillActorSkillData (existingProfsActor, skillProficiencies, actorData, importOpts, opts) {
		opts = opts || {};

		if (!skillProficiencies) return {};
		skillProficiencies = Charactermancer_OtherProficiencySelect.getMappedSkillProficiencies(skillProficiencies);

		const formData = await Charactermancer_OtherProficiencySelect.pGetUserInput({
			...opts,
			existingFvtt: {
				skillProficiencies: existingProfsActor,
			},
			available: skillProficiencies,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		return this.doApplySkillFormDataToActorUpdate({existingProfsActor, formData, actorData});
	}

	static doApplySkillFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		if (!formData?.data?.skillProficiencies) return;

		const out = {};

		// 0 = not, 1 = proficient, 2 = expert, 0.5 = jack of all trades
		actorData.skills = actorData.skills || {};
		Object.entries(UtilActors.SKILL_ABV_TO_FULL)
			.filter(([_, name]) => formData.data.skillProficiencies[name])
			.forEach(([abv, name]) => {
				out[abv] = formData.data.skillProficiencies[name];

				const maxValue = Math.max(
					(existingProfsActor[abv] || {}).value || 0,
					formData.data.skillProficiencies[name] != null ? Number(formData.data.skillProficiencies[name]) : 0,
					(actorData.skills[abv] || {}).value || 0,
				);

				const isUpdate = maxValue > (MiscUtil.get(actorData.skills, abv, "value") || 0);
				if (isUpdate) (actorData.skills[abv] = actorData.skills[abv] || {}).value = maxValue;
			});

		return out;
	}

	/**
	 * @param existingProfsActor Actor's current languages.
	 * @param importingProfs Data from a background or race.
	 * @param data Actor update object to fill.
	 * @param importOpts
	 * @param [opts] Options
	 * @param [opts.titlePrefix]
	 */
	static async pFillActorLanguageData (existingProfsActor, importingProfs, data, importOpts, opts) {
		opts = opts || {};

		if (!importingProfs) return;
		importingProfs = Charactermancer_OtherProficiencySelect.getMappedLanguageProficiencies(importingProfs);

		const formData = await Charactermancer_OtherProficiencySelect.pGetUserInput({
			...opts,
			existingFvtt: {
				languageProficiencies: existingProfsActor,
			},
			available: importingProfs,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyLanguageProficienciesFormDataToActorUpdate({existingProfsActor, formData, actorData: data});
	}

	static doApplyLanguageProficienciesFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		this.doApplyOtherProficienciesFormData({
			existingProfsActor,
			formData,
			formDataProp: "languageProficiencies",
			actorData,
			opts: {
				fnGetMappedItem: it => UtilActors.getMappedLanguage(it),
				actorTraitProp: "languages",
			},
		});
	}

	/**
	 * @param existingProfsActor Actor's current tool proficiencies.
	 * @param importingProfs Data from a background or race.
	 * @param data Actor update object to fill.
	 * @param importOpts
	 * @param [opts] Options
	 * @param [opts.titlePrefix]
	 */
	static async pFillActorToolProfData (existingProfsActor, importingProfs, data, importOpts, opts) {
		opts = opts || {};

		if (!importingProfs) return;
		importingProfs = Charactermancer_OtherProficiencySelect.getMappedToolProficiencies(importingProfs);

		const formData = await Charactermancer_OtherProficiencySelect.pGetUserInput({
			...opts,
			existingFvtt: {
				toolProficiencies: existingProfsActor,
			},
			available: importingProfs,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyToolProficienciesFormDataToActorUpdate({existingProfsActor, formData, actorData: data});
	}

	static doApplyToolProficienciesFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		this.doApplyOtherProficienciesFormData({
			existingProfsActor,
			formData,
			formDataProp: "toolProficiencies",
			actorData,
			opts: {
				fnGetMappedItem: it => UtilActors.getMappedTool(it),
				actorTraitProp: "toolProf",
			},
		});
	}

	/**
	 * @param existingProfsLanguages Actor's current languages.
	 * @param existingProfsTools Actor's current tool proficiencies.
	 * @param importingProfs Data from a background or race.
	 * @param actorData Actor update object to fill.
	 * @param importOpts
	 * @param [opts] Options
	 * @param [opts.titlePrefix]
	 */
	static async pFillActorLanguageOrToolData (existingProfsLanguages, existingProfsTools, importingProfs, actorData, importOpts, opts) {
		opts = opts || {};

		if (!importingProfs) return;
		importingProfs = Charactermancer_OtherProficiencySelect.getMappedLanguageProficiencies(importingProfs);
		importingProfs = Charactermancer_OtherProficiencySelect.getMappedToolProficiencies(importingProfs);

		const formData = await Charactermancer_OtherProficiencySelect.pGetUserInput({
			...opts,
			existingFvtt: {
				languageProficiencies: existingProfsLanguages,
				toolProficiencies: existingProfsTools,
			},
			available: importingProfs,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyOtherProficienciesFormData({
			existingProfsActor: existingProfsLanguages,
			formData,
			formDataProp: "languageProficiencies",
			actorData,
			opts: {
				fnGetMappedItem: it => UtilActors.getMappedLanguage(it),
				actorTraitProp: "languages",
			},
		});

		this.doApplyOtherProficienciesFormData({
			existingProfsActor: existingProfsTools,
			formData,
			formDataProp: "toolProficiencies",
			actorData,
			opts: {
				fnGetMappedItem: it => UtilActors.getMappedTool(it),
				actorTraitProp: "toolProf",
			},
		});
	}

	/**
	 * @param existingProfsActor Actor's current tool proficiencies.
	 * @param importingProfs Data from a background or race.
	 * @param data Actor update object to fill.
	 * @param importOpts
	 * @param [opts] Options
	 * @param [opts.titlePrefix]
	 */
	static async pFillActorArmorProfData (existingProfsActor, importingProfs, data, importOpts, opts) {
		opts = opts || {};

		if (!importingProfs) return;
		importingProfs = Charactermancer_OtherProficiencySelect.getMappedArmorProficiencies(importingProfs);

		const formData = await Charactermancer_OtherProficiencySelect.pGetUserInput({
			...opts,
			existingFvtt: {
				armorProficiencies: existingProfsActor,
			},
			available: importingProfs,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyArmorProficienciesFormDataToActorUpdate({existingProfsActor, formData, actorData: data});
	}

	static doApplyArmorProficienciesFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		this.doApplyOtherProficienciesFormData({
			existingProfsActor,
			formData,
			formDataProp: "armorProficiencies",
			actorData,
			opts: {
				fnGetMappedItem: it => UtilActors.getMappedArmorProficiency(it),
				fnGetMappedCustomItem: it => Renderer.splitTagByPipe(it)[0].toTitleCase(),
				actorTraitProp: "armorProf",
			},
		});
	}

	/**
	 * @param existingProfsActor Actor's current tool proficiencies.
	 * @param importingProfs Data from a background or race.
	 * @param data Actor update object to fill.
	 * @param importOpts
	 * @param [opts] Options
	 * @param [opts.titlePrefix]
	 */
	static async pFillActorWeaponProfData (existingProfsActor, importingProfs, data, importOpts, opts) {
		opts = opts || {};

		if (!importingProfs) return;
		importingProfs = Charactermancer_OtherProficiencySelect.getMappedWeaponProficiencies(importingProfs);

		const formData = await Charactermancer_OtherProficiencySelect.pGetUserInput({
			...opts,
			existingFvtt: {
				weaponProficiencies: existingProfsActor,
			},
			available: importingProfs,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyWeaponProficienciesFormDataToActorUpdate({existingProfsActor, formData, actorData: data});
	}

	static doApplyWeaponProficienciesFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		this.doApplyOtherProficienciesFormData({
			existingProfsActor,
			formData,
			formDataProp: "weaponProficiencies",
			actorData,
			opts: {
				fnGetMappedItem: it => UtilActors.getMappedWeaponProficiency(it),
				fnGetMappedCustomItem: it => Renderer.splitTagByPipe(it)[0].toTitleCase(),
				actorTraitProp: "weaponProf",
			},
		});
	}

	/**
	 * @param existingProfsActor Actor's current proficiencies.
	 * @param formData Data from a background or race.
	 * @param formDataProp Property within `formData` to use.
	 * @param actorData Actor update object to fill.
	 * @param opts Options object
	 * @param [opts.fnGetMappedItem]
	 * @param [opts.fnGetMappedCustomItem]
	 * @param opts.actorTraitProp
	 */
	static doApplyOtherProficienciesFormData ({existingProfsActor, formData, formDataProp, actorData, opts}) {
		if (!formData?.data?.[formDataProp]) return false;

		existingProfsActor = existingProfsActor || {};

		const formDataSet = formData.data[formDataProp];

		if (!Object.keys(formDataSet).length) return false;
		const cpyFormDataSet = MiscUtil.copy(formDataSet);

		const profSet = new Set();
		Object.keys(cpyFormDataSet).filter(k => cpyFormDataSet[k]).forEach(k => profSet.add(k));

		// Map known items to their respective Foundry values; keep invalid items as-is
		const mappedValidItems = new Set();
		const customItems = [];

		// Keep existing items
		(existingProfsActor.value || []).forEach(it => mappedValidItems.add(it));
		(existingProfsActor.custom || "").split(";").map(it => it.trim()).filter(Boolean).forEach(it => this._doApplyFormData_doCheckAddCustomItem(customItems, it));

		// Keep items already in the actor update
		const existingProfsActorData = MiscUtil.get(actorData, "traits", opts.actorTraitProp);
		(existingProfsActorData?.value || []).forEach(it => mappedValidItems.add(it));
		(existingProfsActorData?.custom || "").split(";").map(it => it.trim()).filter(Boolean).forEach(it => this._doApplyFormData_doCheckAddCustomItem(customItems, it));

		// Add new items
		profSet.forEach(it => {
			const mapped = opts.fnGetMappedItem ? opts.fnGetMappedItem(it) : it;
			if (mapped) mappedValidItems.add(mapped);
			else {
				const toAdd = opts.fnGetMappedCustomItem ? opts.fnGetMappedCustomItem(it) : it.toTitleCase();
				this._doApplyFormData_doCheckAddCustomItem(customItems, toAdd);
			}
		});

		// Set data
		const dataTarget = MiscUtil.set(actorData, "traits", opts.actorTraitProp, {});
		dataTarget.value = [...mappedValidItems].map(it => it.toLowerCase()).sort(SortUtil.ascSortLower);
		dataTarget.custom = customItems.join(";");
	}

	static _doApplyFormData_doCheckAddCustomItem (customItems, item) {
		const cleanItem = item.trim().toLowerCase();
		if (!customItems.some(it => it.trim().toLowerCase() === cleanItem)) customItems.push(item);
	}

	static doApplySavingThrowProficienciesFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		if (!formData?.data?.savingThrowProficiencies) return;

		actorData.abilities = actorData.abilities || {};
		Parser.ABIL_ABVS
			.filter(ab => formData.data.savingThrowProficiencies[ab])
			.forEach(ab => {
				const maxValue = Math.max(
					existingProfsActor[ab]?.proficient || 0,
					formData.data.savingThrowProficiencies[ab] ? 1 : 0,
					actorData.abilities[ab]?.proficient || 0,
				);
				const isUpdate = maxValue > (MiscUtil.get(actorData.abilities, ab, "proficient") || 0);
				if (isUpdate) MiscUtil.set(actorData.abilities, ab, "proficient", maxValue);
			});
	}

	/**
	 * @param existingProfsActor Actor's current damage immunities.
	 * @param [importing] Custom data from a race.
	 * @param data Actor update object to fill.
	 * @param importOpts
	 * @param [opts]
	 * @param [opts.titlePrefix]
	 */
	static async pFillActorImmunityData (existingProfsActor, importing, data, importOpts, opts) {
		opts = opts || {};

		const formData = await Charactermancer_DamageImmunitySelect.pGetUserInput({
			...opts,
			existingFvtt: {
				immune: existingProfsActor,
			},
			available: importing,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyDamageImmunityFormDataToActorUpdate({existingProfsActor, formData, actorData: data});
	}

	/**
	 * @param existingProfsActor Actor's current damage resistances.
	 * @param [importing] Custom data from a race.
	 * @param data Actor update object to fill.
	 * @param importOpts
	 * @param [opts]
	 * @param [opts.titlePrefix]
	 */
	static async pFillActorResistanceData (existingProfsActor, importing, data, importOpts, opts) {
		opts = opts || {};

		const formData = await Charactermancer_DamageResistanceSelect.pGetUserInput({
			...opts,
			existingFvtt: {
				resist: existingProfsActor,
			},
			available: importing,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyDamageResistanceFormDataToActorUpdate({existingProfsActor, formData, actorData: data});
	}

	/**
	 * @param existingProfsActor Actor's current damage vulnerabilities.
	 * @param [importing] Custom data from a race.
	 * @param data Actor update object to fill.
	 * @param importOpts
	 * @param [opts]
	 * @param [opts.titlePrefix]
	 */
	static async pFillActorVulnerabilityData (existingProfsActor, importing, data, importOpts, opts) {
		opts = opts || {};

		const formData = await Charactermancer_DamageVulnerabilitySelect.pGetUserInput({
			...opts,
			existingFvtt: {
				vulnerable: existingProfsActor,
			},
			available: importing,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyDamageVulnerabilityFormDataToActorUpdate({existingProfsActor, formData, actorData: data});
	}

	/**
	 * @param existing Actor's current condition immunities.
	 * @param [importing] Custom data from a race.
	 * @param data Actor update object to fill.
	 * @param importOpts
	 * @param [opts]
	 * @param [opts.titlePrefix]
	 */
	static async pFillActorConditionImmunityData (existing, importing, data, importOpts, opts) {
		opts = opts || {};

		const formData = await Charactermancer_ConditionImmunitySelect.pGetUserInput({
			...opts,
			existingFvtt: {
				conditionImmune: existing,
			},
			available: importing,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyConditionImmunityFormDataToActorUpdate({existingProfsActor: existing, formData, actorData: data});
	}

	static doApplyDamageImmunityFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		this.doApplyOtherProficienciesFormData({
			existingProfsActor,
			formData,
			formDataProp: "immune",
			actorData,
			opts: {
				actorTraitProp: "di",
			},
		});
	}

	static doApplyDamageResistanceFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		this.doApplyOtherProficienciesFormData({
			existingProfsActor,
			formData,
			formDataProp: "resist",
			actorData,
			opts: {
				actorTraitProp: "dr",
			},
		});
	}

	static doApplyDamageVulnerabilityFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		this.doApplyOtherProficienciesFormData({
			existingProfsActor,
			formData,
			formDataProp: "vulnerable",
			actorData,
			opts: {
				actorTraitProp: "dv",
			},
		});
	}

	static doApplyConditionImmunityFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		this.doApplyOtherProficienciesFormData({
			existingProfsActor,
			formData,
			formDataProp: "conditionImmune",
			actorData,
			opts: {
				fnGetMappedItem: it => it === "disease" ? "diseased" : it,
				actorTraitProp: "ci",
			},
		});
	}

	/**
	 * @param existingProficienciesSkills Actor's current skill proficiencies.
	 * @param existingProficienciesTools Actor's current tool proficiencies.
	 * @param existingProficienciesLanguages Actor's current languages.
	 * @param expertise Data from background or race.
	 * @param actorData Actor update object to fill.
	 * @param importOpts
	 * @param [titlePrefix]
	 */
	static async pFillActorExpertiseData (
		{
			existingProficienciesSkills,
			existingProficienciesTools,
			expertise,
			actorData,
			importOpts,
			// Other options
			titlePrefix,
		},
	) {
		// region Merge pending actor data updates as "existing" skill/tool profs
		const mergedExistingProficienciesSkills = existingProficienciesSkills ? MiscUtil.copy(existingProficienciesSkills) : existingProficienciesSkills;
		const mergedExistingProficienciesTools = existingProficienciesTools ? MiscUtil.copy(existingProficienciesTools) : existingProficienciesTools;

		if (mergedExistingProficienciesSkills && actorData.skills) {
			Object.entries(actorData.skills)
				.forEach(([key, meta]) => {
					if (!meta) return;

					mergedExistingProficienciesSkills[key] = mergedExistingProficienciesSkills[key] || MiscUtil.copy(meta);
					mergedExistingProficienciesSkills[key].value = Math.max(mergedExistingProficienciesSkills[key].value, meta.value);
				});
		}

		if (mergedExistingProficienciesTools && actorData.traits?.toolProf) {
			mergedExistingProficienciesTools.value = [...mergedExistingProficienciesTools.value, ...MiscUtil.copy(actorData.traits.toolProf.value || [])].unique();
		}
		// endregion

		const formData = await Charactermancer_ExpertiseSelect.pGetUserInput({
			titlePrefix,
			existingFvtt: {
				skillProficiencies: mergedExistingProficienciesSkills,
				toolProficiencies: mergedExistingProficienciesTools,
			},
			available: expertise,
		});
		if (!formData) return importOpts.isCancelled = true;
		if (formData === VeCt.SYM_UI_SKIP) return;

		this.doApplyExpertiseFormDataToActorUpdate({
			existingProfsActor: {
				skillProficiencies: existingProficienciesSkills,
				toolProficiencies: existingProficienciesTools,
			},
			formData,
			actorData: actorData,
		});
	}

	static doApplyExpertiseFormDataToActorUpdate ({existingProfsActor, formData, actorData}) {
		this.doApplySkillFormDataToActorUpdate({
			existingProfsActor: existingProfsActor.skillProficiencies,
			formData,
			actorData,
		});

		this.doApplyOtherProficienciesFormData({
			existingProfsActor: existingProfsActor.toolProficiencies,
			formData,
			formDataProp: "toolProficiencies",
			actorData,
			opts: {
				// FIXME(Future) As of 2021-06-13 Foundry does not support tool expertise in a useful way (it can only be
				//   defined on a tool item, rather than character-wide), so work around this by using custom values.
				fnGetMappedItem: it => {
					if (formData?.data?.toolProficiencies[it] === 2) return null;
					return UtilActors.getMappedTool(it);
				},
				fnGetMappedCustomItem: it => {
					if (formData?.data?.toolProficiencies[it] === 2) return `${it.toTitleCase()} (Expertise)`;
					return it.toTitleCase();
				},
				actorTraitProp: "toolProf",
			},
		});
	}

	static doApplySensesFormDataToActorUpdate ({existingSensesActor, existingTokenActor, formData, actorData, actorToken, configGroup}) {
		if (!Object.keys(formData?.data).length) return;

		const dataTarget = MiscUtil.getOrSet(actorData, "attributes", "senses", {});
		Object.assign(dataTarget, MiscUtil.copy(existingSensesActor));

		Object.entries(formData.data)
			.forEach(([sense, range]) => {
				range = Config.getMetricNumberDistance({configGroup, originalValue: range, originalUnit: "feet"});

				if (!dataTarget[sense]) return dataTarget[sense] = range;
				dataTarget[sense] = Math.max(dataTarget[sense], range);
			});

		const units = Config.getMetricUnitDistance({configGroup, originalUnit: "ft"});
		if (Object.keys(dataTarget).length && (!dataTarget.units || units !== "ft")) dataTarget.units = units;

		// region Apply to token
		let {dimSight: curDimSight} = existingTokenActor || {};
		if (curDimSight === 999) curDimSight = 0; // `999` is the default for newly created actors--override it
		if (!curDimSight) curDimSight = 0;
		if (isNaN(curDimSight)) curDimSight = 0;
		curDimSight = Number(curDimSight);

		// Ensure token sight is reset if it's a junk value
		if (!curDimSight) actorToken.dimSight = curDimSight;
		actorToken.vision = true;

		this.mutTokenSight({
			dataAttributesSenses: dataTarget,
			dataToken: actorToken,
		});
		// endregion
	}

	/**
	 * Upgrade sight values if there's an existing value, and ours beats it.
	 * Note: Assumes all values are in the same unit system.
	 * @param dataAttributesSenses
	 * @param dataToken
	 */
	static mutTokenSight ({dataAttributesSenses, dataToken}) {
		if (!dataAttributesSenses) return {dataAttributesSenses, dataToken};

		if (dataAttributesSenses.darkvision) dataToken.dimSight = Math.max(dataToken.dimSight, dataAttributesSenses.darkvision);

		// Treat these as "bright sight," as they represent the creature having an unrestricted view of the area.
		for (const prop of ["blindsight", "tremorsense", "truesight"]) {
			if (dataAttributesSenses[prop]) dataToken.brightSight = Math.max(dataToken.brightSight, dataAttributesSenses[prop]);
		}

		return {dataAttributesSenses, dataToken};
	}

	static _RE_IS_VERSATILE = / (?:two|both) hands/i;
	static getDamageTupleMetas (str, {summonSpellLevel = 0} = {}) {
		const damageTupleMetas = [];

		const ixFirstDc = str.indexOf(`{@dc `);

		let ixLastMatch = null;
		let lenLastMatch = null;

		// number or roll; will be a number for e.g. "1 piercing damage"
		// "the spell's level" part for e.g. TCE's Aberrant Spirit
		// "plus ..." part for e.g. Orc War Chief
		const strOut = str
			.replace(/(?:(?<dmgFlat>\d+)|\(?{@(?:dice|damage) (?<dmgDice1>[^|}]+)(?:\|[^}]+)?}(?:\s+[-+]\s+the spell's level)?(?: plus {@(?:dice|damage) (?<dmgDice2>[^|}]+)(?:\|[^}]+)?})?\)?)(?:\s+[-+]\s+[-+a-zA-Z0-9 ]*?)?(?: (?<dmgType>[^ ]+))? damage/gi, (...mDamage) => {
				const [fullMatch] = mDamage;
				const [ixMatch] = mDamage.slice(-2, -1);
				const {dmgFlat, dmgDice1, dmgDice2, dmgType} = mDamage.last();

				const dmgDice1Clean = dmgDice1 ? dmgDice1.split("|")[0] : null;
				const dmgDice2Clean = dmgDice2 ? dmgDice2.split("|")[0] : null;
				const dmgTypeClean = dmgType || "";

				const isFlatDamage = dmgFlat != null;
				let dmg = isFlatDamage
					? dmgFlat
					: dmgDice2Clean
						? `${dmgDice1Clean} + ${dmgDice2Clean}` : dmgDice1Clean;

				// Ensure the flat damage is not a condition, e.g. CoS Tree Blight "by dealing 6 slashing damage [to the blight]"
				if (isFlatDamage) {
					const tokens = str.split(/( )/g);
					let lenTokenStack = 0;
					const tokenStack = [];
					for (let i = 0; i < tokens.length; ++i) {
						tokenStack.push(tokens[i]);
						lenTokenStack += tokens[i].length;

						if (lenTokenStack === ixMatch) {
							const lastFourTokens = tokenStack.slice(-4);
							if (/^by dealing$/i.test(lastFourTokens.join("").trim())) {
								return "";
							}
						}
					}
				}

				// Switch out proficiency bonus
				dmg = dmg.replace(/\bPB\b/gi, "@srd5e.userchar.pb");

				// Switch out `summonSpellLevel`
				dmg = dmg.replace(/\bsummonSpellLevel\b/gi, `${summonSpellLevel ?? 0}`);

				const tupleMeta = {
					tuple: [dmg, dmgTypeClean],
					isOnFailSavingThrow: false,
					isAlternateRoll: false,
				};

				// If this damage appears to be from failing a DC, mark it as such
				if (~ixFirstDc && ixMatch >= ixFirstDc) {
					tupleMeta.isOnFailSavingThrow = true;
				}

				// If this damage comes after another damage roll, *and* there is an "... or ..." between the two rolls,
				//   or if the previous damage roll was an alt-roll, mark this roll as an alt-roll.
				if (
					damageTupleMetas.last()?.isAlternateRoll
					|| (
						damageTupleMetas.length
						&& /\bor\b/.test(str.slice(ixLastMatch + lenLastMatch, ixMatch))
						&& !this._RE_IS_VERSATILE.test(str.slice(ixMatch + fullMatch.length))
					)
				) {
					tupleMeta.isAlternateRoll = true;
				}

				damageTupleMetas.push(tupleMeta);

				ixLastMatch = ixMatch;
				lenLastMatch = fullMatch.length;

				return "";
			})
			.replace(/ +/g, " ");

		return {
			str: strOut, // Return this string without damage parts
			damageTupleMetas: damageTupleMetas.filter(it => it.tuple.length),
		};
	}

	static getDamagePartsAndOtherFormula (damageTupleMetas) {
		damageTupleMetas = damageTupleMetas || [];

		const damageTuples = [];
		const otherFormulaParts = [];

		damageTupleMetas.forEach(meta => {
			if (
				(!Config.get("import", "isUseOtherFormulaFieldForSaveHalvesDamage") || !meta.isOnFailSavingThrow)
				&& (!Config.get("import", "isUseOtherFormulaFieldForSaveHalvesDamage") || !meta.isAlternateRoll)
			) return damageTuples.push(meta.tuple);

			otherFormulaParts.push(`${meta.tuple[1] ? "(" : ""}${meta.tuple[0]}${meta.tuple[1] ? `)[${meta.tuple[1]}]` : ""}`);
		});

		// If the "save halves" damage is not a rider on some other damage, return generic damage
		if (!damageTuples.length) return {damageParts: damageTupleMetas.map(it => it.tuple), formula: ""};

		return {damageParts: damageTuples, formula: otherFormulaParts.join(" + ")};
	}

	static getSpeedValue (speeds, prop, configGroup) {
		if (speeds == null) return null;

		if (typeof speeds === "number") {
			return prop === "walk"
				? Config.getMetricNumberDistance({configGroup, originalValue: speeds, originalUnit: "feet"})
				: null;
		}

		const speed = speeds[prop];

		if (speed == null) return null;
		// A value of "true" represents "equal to walking speed"
		if (typeof speed === "boolean") return null;
		if (speed.number != null) return Config.getMetricNumberDistance({configGroup, originalValue: speed.number, originalUnit: "feet"});
		if (isNaN(speed)) return null;
		return Config.getMetricNumberDistance({configGroup, originalValue: Number(speed), originalUnit: "feet"});
	}

	// 5et prop -> FVTT prop
	static _SPEED_PROPS_IS_EQUAL_MAP = {
		burrow: "burrow",
		climb: "climb",
		fly: "fly",
		swim: "swim",
	};
	static async pGetSpeedEffects (speeds, {actor, actorItem, iconEntity, iconPropCompendium} = {}) {
		if (speeds == null || typeof speeds === "number") return [];

		const toMap = Object.entries(speeds)
			.filter(([k, v]) => this._SPEED_PROPS_IS_EQUAL_MAP[k] && v === true);

		if (!toMap.length) return [];

		const icon = iconEntity && iconPropCompendium
			? await this._pGetSaveImagePath(iconEntity, {propCompendium: iconPropCompendium})
			: undefined;

		return toMap.map(([k]) => {
			return UtilActiveEffects.getGenericEffect({
				key: `data.attributes.movement.${this._SPEED_PROPS_IS_EQUAL_MAP[k]}`,
				value: `@attributes.movement.walk`,
				mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
				label: `${k.toTitleCase()} Speed`,
				icon,
				disabled: false,
				priority: UtilActiveEffects.PRIORITY_BASE,
				originActor: actor,
				originActorItem: actorItem,
			});
		});
	}

	static isSpeedHover (speed) {
		if (typeof speed === "number") return false;
		return !!speed.canHover;
	}

	static getMovement (speed, {configGroup = null} = {}) {
		return {
			burrow: DataConverter.getSpeedValue(speed, "burrow", configGroup),
			climb: DataConverter.getSpeedValue(speed, "climb", configGroup),
			fly: DataConverter.getSpeedValue(speed, "fly", configGroup),
			swim: DataConverter.getSpeedValue(speed, "swim", configGroup),
			walk: DataConverter.getSpeedValue(speed, "walk", configGroup),
			units: Config.getMetricUnitDistance({configGroup, originalUnit: "ft"}),
			hover: DataConverter.isSpeedHover(speed),
		};
	}

	static getParsedWeaponEntryData (imp, weap) {
		if (!(weap.entries && weap.entries[0] && typeof weap.entries[0] === "string")) return;

		const damageTupleMetas = [];
		let attackBonus = 0;

		const str = weap.entries[0];

		damageTupleMetas.push(...DataConverter.getDamageTupleMetas(str).damageTupleMetas);

		const {rangeShort, rangeLong} = DataConverter.getAttackRange(str);

		const mHit = /{@hit ([^|}]+)(?:\|[^}]+)?}/gi.exec(str);
		if (mHit) {
			const hitBonus = Number(mHit[1]);
			if (!isNaN(hitBonus)) {
				attackBonus = hitBonus;
			}
		}

		const {isAttack, isRecharge, actionType, attackTypes} = DataConverter.getAttackActionType(weap.name, str);

		return {
			damageTupleMetas,
			isAttack,
			isRecharge,
			rangeShort,
			rangeLong,
			actionType,
			attackBonus,
			attackTypes, // 5etools flags from `@atk` tags, e.g. "m", "s", "r", "w"...
		};
	}

	static getAttackRange (str) {
		let rangeShort = null;
		let rangeLong = null;

		// Prioritise range first, as you can throw a melee weapon, but you Can't:tm: melee with a ranged weapon
		const mRange = /range (\d+)(?:\/(\d+))? ft/gi.exec(str);
		if (mRange) {
			rangeShort = Number(mRange[1]);
			if (mRange[2]) rangeLong = Number(mRange[2]);
		} else {
			const mReach = /reach (\d+) ft/gi.exec(str);
			if (mReach) {
				rangeShort = Number(mReach[1]);
			}
		}

		return {rangeShort, rangeLong};
	}

	static getAttackActionType (name, str) {
		const state = new class {
			constructor () {
				this.actionType = "";
				this.isAttack = false;
				this.isRecharge = false;
				this.attackTypes = "";
				this.isMelee = false;
				this.isRanged = false;
				this.isSpell = false;
			}
		}();

		this._getAttackActionType_attackTypes({name, str, state});

		if (name) {
			if (/{@recharge( \d+)?}/.test(name)) state.isRecharge = true;
		}

		return {...state};
	}

	static _getAttackActionType_attackTypes ({name, str, state}) {
		const mAtk = /{@atk (?<types>[^}]+)}/gi.exec(str);
		if (!mAtk) return;

		state.attackTypes = mAtk.groups.types;
		state.isAttack = true;

		state.isMelee = state.attackTypes.includes("m");
		state.isRanged = state.attackTypes.includes("r");
		state.isSpell = state.attackTypes.includes("s");

		if (state.isSpell && state.isMelee) return state.actionType = "msak";
		if (state.isSpell && state.isRanged) return state.actionType = "rsak";

		if (state.isMelee) return state.actionType = "mwak";
		if (state.isRanged) return state.actionType = "rwak";
	}

	static getActorDamageResImmVulnConditionImm (ent) {
		const out = {};

		const allDis = new Set();
		let customDis = [];
		this._getActorDamageResImmVulnConditionImm_addDamageTypesOrConditionTypes({
			ent,
			validTypesArr: UtilActors.VALID_DAMAGE_TYPES,
			fnRender: Parser.getFullImmRes,
			prop: "immune",
			allSet: allDis,
			customStack: customDis,
		});

		out.di = {
			value: [...allDis],
			custom: customDis.join(", "),
		};

		const allDrs = new Set();
		let customDrs = [];
		this._getActorDamageResImmVulnConditionImm_addDamageTypesOrConditionTypes({
			ent,
			validTypesArr: UtilActors.VALID_DAMAGE_TYPES,
			fnRender: Parser.getFullImmRes,
			prop: "resist",
			allSet: allDrs,
			customStack: customDrs,
		});

		out.dr = {
			value: [...allDrs],
			custom: customDrs.join(", "),
		};

		const allDvs = new Set();
		let customDvs = [];
		this._getActorDamageResImmVulnConditionImm_addDamageTypesOrConditionTypes({
			ent,
			validTypesArr: UtilActors.VALID_DAMAGE_TYPES,
			fnRender: Parser.getFullImmRes,
			prop: "vulnerable",
			allSet: allDvs,
			customStack: customDvs,
		});

		out.dv = {
			value: [...allDvs],
			custom: customDvs.join(", "),
		};

		const allCis = new Set();
		let customCis = [];
		this._getActorDamageResImmVulnConditionImm_addDamageTypesOrConditionTypes({
			ent,
			validTypesArr: UtilActors.VALID_CONDITIONS,
			fnRender: arr => Parser.getFullCondImm(arr, true),
			prop: "conditionImmune",
			allSet: allCis,
			customStack: customCis,
		});

		out.ci = {
			value: [...allCis],
			custom: customCis.join(", "),
		};

		return out;
	}

	static _getActorDamageResImmVulnConditionImm_addDamageTypesOrConditionTypes (
		{ent, validTypesArr, fnRender, prop, allSet, customStack},
	) {
		if (!ent[prop]) return;

		ent[prop].forEach(it => {
			if (validTypesArr.includes(it)) allSet.add(it);
			else if (
				this._PROPS_DAMAGE_IMM_VULN_RES.has(prop)
				&& it[prop]
				&& it[prop] instanceof Array
				&& CollectionUtil.setEq(new Set(it[prop]), this._SET_PHYSICAL_DAMAGE)
				&& it.note
				&& /\bnon[- ]?magical\b/.test(it.note)
				&& it.cond
			) {
				allSet.add("physical");
			} else {
				const asText = fnRender([it]);
				customStack.push(asText);
			}
		});
	}

	/**
	 * @param ent
	 * @param propBrew
	 * @param fnLoadJson
	 * @param propJson
	 * @param propsMatch Properties to match on. Note that ordering is important, as it should be a lookup into the
	 * "addon data" module's map.
	 */
	static async _pGetSideLoadedMatch (ent, {propBrew, fnLoadJson, propJson, propsMatch = ["source", "name"]}) {
		const founds = [];

		if (UtilCompat.isPlutoniumAddonAutomationActive()) {
			const valsLookup = propsMatch.map(prop => ent[prop]).filter(Boolean);
			const found = await UtilCompat.getApi(UtilCompat.MODULE_PLUTONIUM_ADDON_AUTOMATION)
				.pGetExpandedAddonData({
					propJson,
					path: valsLookup,
					fnMatch: this._pGetAdditional_fnMatch.bind(this, propsMatch, ent),
				});
			if (found) founds.push(found);
		}

		if (propBrew) {
			const brew = await BrewUtil2.pGetBrewProcessed();
			const found = (MiscUtil.get(brew, propBrew) || [])
				.find(it => this._pGetAdditional_fnMatch(propsMatch, ent, it));
			if (found) founds.push(found);
		}

		if (fnLoadJson && propJson) {
			const sideJson = await fnLoadJson();
			const found = (sideJson[propJson] || [])
				.find(it => this._pGetAdditional_fnMatch(propsMatch, ent, it));
			if (found) founds.push(found);
		}

		if (!founds.length) return null;
		if (founds.length === 1) return founds[0];

		// If there are multiple available, merge. A prop is merged if:
		//   - it does not exist in the first object, but exists in the second
		//   - it exists in the first and second objects, and `_merge.[prop]` is true.
		const out = MiscUtil.copy(founds[0]);
		delete out._merge;

		founds.slice(1)
			.forEach((found, i) => {
				Object.entries(found)
					.filter(([prop]) => prop !== "_merge")
					.forEach(([prop, v]) => {
						if (out[prop] === undefined) return out[prop] = v;

						const prevFounds = founds.slice(0, i + 1);
						if (!prevFounds.every(foundPrev => foundPrev[prop] === undefined || foundPrev._merge?.[prop])) return;

						if (out[prop] == null) return out[prop] = v;
						if (typeof out[prop] !== "object") return out[prop] = v;

						if (out[prop] instanceof Array) {
							if (!(v instanceof Array)) throw new Error(`Could not _merge array and non-array`); // Should never occur

							return out[prop] = [...out[prop], ...v];
						}

						out[prop] = foundry.utils.mergeObject(out[prop], v);
					});
			});

		return out;
	}

	static _pGetAdditional_fnMatch (propsMatch, entity, additionalDataEntity) {
		return propsMatch
			.every(prop => {
				if (typeof entity[prop] === "number" || typeof additionalDataEntity[prop] === "number") return Number(entity[prop]) === Number(additionalDataEntity[prop]);
				return `${(entity[prop] || "")}`.toLowerCase() === `${(additionalDataEntity[prop] || "").toLowerCase()}`;
			});
	}

	static async _pGetDataSideLoaded_ (ent, {propBrew, fnLoadJson, propJson, propsMatch}) {
		return this._pGetStarSideLoaded(ent, {propBrew, fnLoadJson, propJson, propsMatch, propFromEntity: "foundryData", propFromSideLoaded: "data"});
	}

	static async pGetSideLoadedType_ (ent, {propBrew, fnLoadJson, propJson, propsMatch, validTypes}) {
		let out = await this._pGetStarSideLoaded(ent, {propBrew, fnLoadJson, propJson, propsMatch, propFromEntity: "foundryType", propFromSideLoaded: "type"});
		if (!out) return out;
		out = out.toLowerCase().trim();
		if (validTypes && !validTypes.has(out)) return null;
		return out;
	}

	static async _pGetEffectsRawSideLoaded_ (ent, {propBrew, fnLoadJson, propJson, propsMatch}) {
		const out = await this._pGetStarSideLoaded(ent, {propBrew, fnLoadJson, propJson, propsMatch, propFromEntity: "foundryEffects", propFromSideLoaded: "effects"});

		if (!out?.length) return out;

		return out.filter(it => {
			if (!it) return false;
			if (!it.requires) return true;

			return Object.keys(it.requires).every(k => UtilCompat.isModuleActive(k));
		});
	}

	static async _pGetStarSideLoaded (ent, {propBrew, fnLoadJson, propJson, propsMatch, propFromEntity, propFromSideLoaded}) {
		const found = await this._pGetSideLoadedMatch(ent, {propBrew, fnLoadJson, propJson, propsMatch});
		return this._pGetStarSideLoadedFound(ent, {propFromEntity, propFromSideLoaded, found});
	}

	static async _pGetStarSideLoadedFound (ent, {propFromEntity, propFromSideLoaded, found}) {
		const fromEntity = ent[propFromEntity];

		if ((!found || !found[propFromSideLoaded]) && !fromEntity) return null;

		// Allow the `foundryData` property on the entity to override/compliment anything defined as separate data
		const out = MiscUtil.copy(found?.[propFromSideLoaded] ? found[propFromSideLoaded] : fromEntity);
		if (found?.[propFromSideLoaded] && fromEntity) {
			if (out instanceof Array) out.push(...MiscUtil.copy(fromEntity)); // Array merge strategy, for effects
			else Object.assign(out, MiscUtil.copy(fromEntity)); // Object merge strategy, for data
		}

		return out;
	}

	static async _pGetFlagsSideLoaded_ (ent, {propBrew, fnLoadJson, propJson, propsMatch}) {
		return this._pGetStarSideLoaded(ent, {propBrew, fnLoadJson, propJson, propsMatch, propFromEntity: "foundryFlags", propFromSideLoaded: "flags"});
	}

	static async _pGetAdvancementSideLoaded_ (ent, {propBrew, fnLoadJson, propJson, propsMatch}) {
		return this._pGetStarSideLoaded(ent, {propBrew, fnLoadJson, propJson, propsMatch, propFromEntity: "foundryAdvancement", propFromSideLoaded: "advancement"});
	}

	static async _pGetImgSideLoaded_ (ent, {propBrew, fnLoadJson, propJson, propsMatch}) {
		return this._pGetStarSideLoaded(ent, {propBrew, fnLoadJson, propJson, propsMatch, propFromEntity: "foundryImg", propFromSideLoaded: "img"});
	}

	static async _pGetIsIgnoredSideLoaded_ (ent, {propBrew, fnLoadJson, propJson, propsMatch}) {
		return this._pGetStarSideLoaded(ent, {propBrew, fnLoadJson, propJson, propsMatch, propFromEntity: "foundryIsIgnored", propFromSideLoaded: "isIgnored"});
	}

	static getImportedEmbed (importedEmbeds, itemData) {
		const importedEmbed = importedEmbeds.find(it => it.raw === itemData);

		if (!importedEmbed) {
			ui.notifications.warn(`Failed to link embedded entity for active effects! ${VeCt.STR_SEE_CONSOLE}`);
			console.warn(...LGT, `Could not find loaded item data`, itemData, `in imported embedded entities`, importedEmbeds);
			return null;
		}

		return importedEmbed;
	}

	static getConsumedSheetItem ({consumes, actor}) {
		return (actor?.items?.contents || []).find(it => it.type === "feat" && it.name.toLowerCase().trim() === consumes.name.toLowerCase().trim());
	}

	static mutEffectsDisabledTransfer (effects, configGroup, opts = {}) {
		if (!effects) return;

		return effects.map(effect => this.mutEffectDisabledTransfer(effect, configGroup, opts));
	}

	static mutEffectDisabledTransfer (
		effect,
		configGroup,
		{
			hintDisabled = null,
			hintTransfer = null,
		} = {},
	) {
		if (!effect) return;

		const disabled = Config.get(configGroup, "setEffectDisabled");
		switch (disabled) {
			case ConfigConsts.C_USE_PLUT_VALUE: effect.disabled = hintDisabled != null
				? hintDisabled
				: false;
				break;
			case ConfigConsts.C_BOOL_DISABLED: effect.disabled = false; break;
			case ConfigConsts.C_BOOL_ENABLED: effect.disabled = true; break;
		}

		const transfer = Config.get(configGroup, "setEffectTransfer");
		switch (transfer) {
			case ConfigConsts.C_USE_PLUT_VALUE: effect.transfer = hintTransfer != null
				? hintTransfer
				: true;
				break;
			case ConfigConsts.C_BOOL_DISABLED: effect.transfer = false; break;
			case ConfigConsts.C_BOOL_ENABLED: effect.transfer = true; break;
		}

		return effect;
	}
}

DataConverter.SYM_AT = "<PLUT_SYM__AT>";

DataConverter.ITEM_TYPES_ACTOR_TOOLS = new Set(["AT", "GS", "INS", "T"]);
DataConverter.ITEM_TYPES_ACTOR_WEAPONS = new Set(["M", "R"]);
DataConverter.ITEM_TYPES_ACTOR_ARMOR = new Set(["LA", "MA", "HA", "S"]);

DataConverter._PROPS_DAMAGE_IMM_VULN_RES = new Set(["immune", "resist", "vulnerable"]);
DataConverter._SET_PHYSICAL_DAMAGE = new Set(["bludgeoning", "piercing", "slashing"]);

DataConverter._CASTER_PROGRESSIONS = [ // Ordered by max spell slots
	"full",
	"artificer",
	"1/2",
	"1/3",
	"pact",
];

export {DataConverter};
