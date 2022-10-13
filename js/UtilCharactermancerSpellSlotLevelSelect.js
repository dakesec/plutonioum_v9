import {Consts} from "./Consts.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {DataConverter} from "./DataConverter.js";
import {LGT} from "./Util.js";
import {Charactermancer_Util} from "./UtilCharactermancer.js";

class Charactermancer_Spell_Util {
	/**
	 * @param opts
	 * @param opts.casterProgression The class spellcasting progression
	 * @param opts.curLevel The current actor level (zero is valid)
	 * @param opts.targetLevel The target actor level
	 * @param [opts.isBreakpointsOnly] If class levels between jumps in spell level should be ignored.
	 */
	static getCasterProgressionMeta ({casterProgression, curLevel, targetLevel, isBreakpointsOnly = false}) {
		if (casterProgression == null || curLevel == null || targetLevel == null) return null;

		const progression = UtilDataConverter.CASTER_TYPE_TO_PROGRESSION[casterProgression];
		if (!progression) return null;

		const levelToSpellLevel = [];
		let lastSpellLevel = 0;
		progression.forEach(slots => {
			let isFound = false;
			for (let i = 0; i < slots.length; ++i) {
				const spellLevel = i + 1;
				if (slots[i] && spellLevel > lastSpellLevel) {
					levelToSpellLevel.push(spellLevel);
					lastSpellLevel = spellLevel;
					isFound = true;
					break;
				}
			}
			if (!isFound) {
				if (isBreakpointsOnly) levelToSpellLevel.push(null);
				// Copy the last spell level to form a contiguous spell level array
				else levelToSpellLevel.push(levelToSpellLevel.length ? levelToSpellLevel.last() : null);
			}
		});

		const spannedLevels = levelToSpellLevel.slice(curLevel, targetLevel).filter(Boolean);
		if (!spannedLevels.length) return null;

		const spellLevelLow = Math.min(...spannedLevels);
		const spellLevelHigh = Math.max(...spannedLevels);

		const deltaLevels = Math.max(0, targetLevel - curLevel);
		const deltaSpellLevels = spellLevelHigh - spellLevelLow;

		return {
			spellLevelLow,
			spellLevelHigh,
			deltaLevels,
			deltaSpellLevels,
		};
	}

	static getCasterCantripProgressionMeta ({cls, sc, curLevel, targetLevel}) {
		if (cls == null || curLevel == null || targetLevel == null) return null;

		const atCurLevel = curLevel === 0 ? 0 : this.getMaxLearnedCantrips({cls, sc, targetLevel: curLevel});
		const atTargetLevel = this.getMaxLearnedCantrips({cls, sc, targetLevel: targetLevel});
		if (atCurLevel == null || atTargetLevel == null) return null;

		const deltaLevels = Math.max(0, targetLevel - curLevel);
		const deltaMaxCantrips = atTargetLevel - atCurLevel;

		return {
			maxCantripsLow: atCurLevel,
			maxCantripsHigh: atTargetLevel,
			deltaLevels,
			deltaMaxCantrips,
		};
	}

	static getMaxLearnedCantrips ({cls, sc, targetLevel}) {
		if (!cls || targetLevel == null) return null;

		let cantripProgression = DataConverter.getMaxCantripProgression(cls.cantripProgression, sc?.cantripProgression);

		// Auto-detect for homebrew, if required
		if (BrewUtil2.hasSourceJson(cls.source) || (sc && BrewUtil2.hasSourceJson(sc.source))) cantripProgression = cantripProgression || this._getApproximateCantripProgression({cls, sc});

		if (!cantripProgression) return null;

		return cantripProgression[targetLevel - 1];
	}

	static _getApproximateCantripProgression ({cls, sc}) {
		return this._getApproximateNumberCol({cls, sc, colNameLower: "cantrips known"});
	}

	static _getApproximateSpellsKnownProgression (cls, sc) {
		return this._getApproximateNumberCol({cls, sc, colNameLower: "spells known"});
	}

	static _getApproximateNumberCol ({cls, sc, colNameLower}) {
		const tableGroups = (BrewUtil2.hasSourceJson(cls.source) ? cls.classTableGroups : null)
			|| ((sc && BrewUtil2.hasSourceJson(sc.source)) ? sc?.subclassTableGroups : null);
		if (!tableGroups) return;
		for (const tblGroup of tableGroups) {
			const ixCol = (tblGroup.colLabels || []).findIndex(it => `${it}`.toLowerCase().includes(colNameLower));
			if (!~ixCol) continue;

			const numbers = (tblGroup.rowsSpellProgression || tblGroup.rows || []).map(row => row.filter((_, ixCell) => ixCell === ixCol)).flat();

			if (numbers.every(it => !isNaN(it))) return numbers.map(it => Number(it));
		}
	}

	static getFixedLearnedProgression ({cls, sc, targetLevel, isExistingClass, isDefault = false, formDataSlotSelectFromComp} = {}) {
		if (targetLevel == null) return null;

		const casterProgression = DataConverter.getMaxCasterProgression(cls.casterProgression, sc?.casterProgression);

		if (!casterProgression || !UtilDataConverter.CASTER_TYPE_TO_PROGRESSION[casterProgression]) return null;

		const totalKnownPerLevel = [...new Array(9)].map(() => 0);

		let isAnyData = false;

		const formDataSlotSelect = (isExistingClass || isDefault)
			? Charactermancer_Spell_SlotLevelSelect.getDefaultFormData({
				targetLevel,
				casterProgression,
				// ISSUE(3) this should select the max
				spellsKnownProgression: cls?.spellsKnownProgression || sc?.spellsKnownProgression,
				// ISSUE(3) this should select the max
				spellsKnownProgressionFixed: cls?.spellsKnownProgressionFixed || sc?.spellsKnownProgressionFixed,
			})
			: formDataSlotSelectFromComp;

		if (formDataSlotSelect) {
			isAnyData = isAnyData || formDataSlotSelect?.isAnyData;
			if (formDataSlotSelect?.data) formDataSlotSelect.data.forEach((it, i) => totalKnownPerLevel[i] += it);
		}

		if (cls.spellsKnownProgressionFixedByLevel) {
			isAnyData = true;

			Object.entries(cls.spellsKnownProgressionFixedByLevel)
				.forEach(([lvl, spellSummary]) => {
					if (Number(lvl) > targetLevel) return;

					Object.entries(spellSummary)
						.forEach(([lvlSpell, count]) => {
							lvlSpell = Number(lvlSpell);
							totalKnownPerLevel[lvlSpell - 1] += count;
						});
				});
		}

		// If there is no slot data to apply, null out the field
		if (!isAnyData) return null;

		// For a 3rd-level Wizard, the output is e.g.:
		//   `[8, 2, 0, 0, 0, 0, 0, 0, 0]`
		return totalKnownPerLevel;
	}

	static getMaxPreparedSpells ({cls, sc, targetLevel, existingAbilityScores, abilityScoresFromComp} = {}) {
		if (!cls || targetLevel == null) return null;

		const casterProgression = DataConverter.getMaxCasterProgression(cls.casterProgression, sc?.casterProgression);

		if (!casterProgression || !UtilDataConverter.CASTER_TYPE_TO_PROGRESSION[casterProgression]) return null;

		const spellSlotsAtLevel = UtilDataConverter.CASTER_TYPE_TO_PROGRESSION[casterProgression][targetLevel - 1];
		if (!spellSlotsAtLevel) return null;

		// If there are no spell slots at this level, we can't prepare spells at this level
		if (!spellSlotsAtLevel.some(Boolean)) return null;

		let preparedSpellExpression = cls.preparedSpells;

		if (BrewUtil2.hasSourceJson(cls.source)) {
			// Attempt to generate a prepared spell expression for homebrew classes, if it doesn't exist
			preparedSpellExpression = preparedSpellExpression || this._getApproximatePreparedFormula(cls, sc);
		}

		if (!preparedSpellExpression) return null;

		const totalsAsi = abilityScoresFromComp;
		const preparedSpellExpressionEvaluable = preparedSpellExpression.replace(/<\$([^$]+)\$>/g, (...m) => {
			switch (m[1]) {
				case "level": return targetLevel;
				case "str_mod": return this._getMaxPreparedSpells_getAbilityScore({ability: "str", totalsAsi, existingAbilityScores});
				case "dex_mod": return this._getMaxPreparedSpells_getAbilityScore({ability: "dex", totalsAsi, existingAbilityScores});
				case "con_mod": return this._getMaxPreparedSpells_getAbilityScore({ability: "con", totalsAsi, existingAbilityScores});
				case "int_mod": return this._getMaxPreparedSpells_getAbilityScore({ability: "int", totalsAsi, existingAbilityScores});
				case "wis_mod": return this._getMaxPreparedSpells_getAbilityScore({ability: "wis", totalsAsi, existingAbilityScores});
				case "cha_mod": return this._getMaxPreparedSpells_getAbilityScore({ability: "cha", totalsAsi, existingAbilityScores});
				default: throw new Error(`Unknown variable "${m[1]}"`);
			}
		});

		// eslint-disable-next-line no-eval
		const outRaw = eval(preparedSpellExpressionEvaluable);
		if (isNaN(outRaw)) {
			console.warn(...LGT, `Could not evaluate expression "${preparedSpellExpressionEvaluable}" (originally "${preparedSpellExpression}") as a number!`);
			return null;
		}

		// We prepare a minimum of 1 spell, and round down any fractions
		return Math.max(1, Math.floor(outRaw));
	}

	static getMaxPreparedSpellsFormula ({cls, sc} = {}) {
		if (!cls) return null;

		const casterProgression = DataConverter.getMaxCasterProgression(cls.casterProgression, sc?.casterProgression);

		if (!casterProgression || !UtilDataConverter.CASTER_TYPE_TO_PROGRESSION[casterProgression]) return null;

		let preparedSpellExpression = cls.preparedSpells;

		if (BrewUtil2.hasSourceJson(cls.source)) {
			// Attempt to generate a prepared spell expression for homebrew classes, if it doesn't exist
			preparedSpellExpression = preparedSpellExpression || this._getApproximatePreparedFormula(cls, sc);
		}

		if (!preparedSpellExpression) return null;

		const preparedSpellExpressionEvaluable = preparedSpellExpression.replace(/<\$([^$]+)\$>/g, (...m) => {
			switch (m[1]) {
				case "level": return `@classes.${Parser.stringToSlug(cls.name)}.levels`;
				case "str_mod":
				case "dex_mod":
				case "con_mod":
				case "int_mod":
				case "wis_mod":
				case "cha_mod": return `@abilities.${m[1].toLowerCase().slice(0, 3)}.mod`;
				default: throw new Error(`Unknown variable "${m[1]}"`);
			}
		});

		// We prepare a minimum of 1 spell, and round down any fractions
		return `max(1, floor(${preparedSpellExpressionEvaluable}))`;
	}

	static _getMaxPreparedSpells_getAbilityScore ({totalsAsi, existingAbilityScores, ability}) {
		if (existingAbilityScores) return existingAbilityScores[ability] || 0;
		return Parser.getAbilityModNumber(totalsAsi?.totals?.[totalsAsi.mode]?.[ability] || 0);
	}

	static _getApproximatePreparedFormula (cls, sc) {
		if (!cls) return null;

		const casterProgression = DataConverter.getMaxCasterProgression(cls.casterProgression, sc?.casterProgression);

		if (!casterProgression || (!cls.classTableGroups && !sc?.subclassTableGroups) || casterProgression === "pact") return null;

		const hasSpellsKnown = [cls.classTableGroups, sc?.subclassTableGroups]
			.filter(Boolean)
			.some(tableGroups => {
				tableGroups.map(it => it.colLabels || [])
					.flat()
					.map(lbl => Renderer.stripTags(`${lbl}`.trim()))
					.some(it => {
						const parts = it.toLowerCase().split(/[^a-z0-9]/g).map(it => it.trim()).filter(Boolean);
						return parts.some(pt => pt === "spell" || pt === "spells") && parts.some(pt => pt === "known");
					});
			});

		if (hasSpellsKnown) return null;

		// Default to "5" as the ability modifier if the ability score is unavailable--the user can trim down after
		return `<$level$> ${casterProgression !== "full" ? `/ 2 ` : ""}+ ${cls.spellcastingAbility ? `<$${cls.spellcastingAbility}_mod$>` : "5"}`;
	}

	static getExistingCasterMeta ({cls, sc, actor, targetLevel, formDataSlotSelectFromComp = null, abilityScoresFromComp = null}) {
		if (!targetLevel) return null;

		const casterProgression = DataConverter.getMaxCasterProgression(cls?.casterProgression, sc?.casterProgression);
		const casterProgressionMeta = Charactermancer_Spell_Util.getCasterProgressionMeta({casterProgression, curLevel: 0, targetLevel: targetLevel});

		return {
			maxLearnedCantrips: this.getMaxLearnedCantrips({cls, sc, targetLevel}),
			fixedLearnedProgression: this.getFixedLearnedProgression({cls, sc, targetLevel, isExistingClass: true, formDataSlotSelectFromComp}),
			maxPreparedSpells: this.getMaxPreparedSpells({cls, sc, targetLevel, existingAbilityScores: Charactermancer_Util.getCurrentAbilityScores(actor), abilityScoresFromComp}),
			spellLevelLow: casterProgressionMeta?.spellLevelLow,
			spellLevelLowHigh: casterProgressionMeta?.spellLevelHigh,
		};
	}
}

class Charactermancer_Spell_SlotLevelSelect extends BaseComponent {
	constructor (className) {
		super();
		this._className = className;
	}

	set curLevel (val) { this._state.curLevel = val; }
	set targetLevel (val) { this._state.targetLevel = val; }
	set spellsKnownProgression (val) { this._state.spellsKnownProgression = val; }
	set casterProgression (val) { this._state.casterProgression = val; }
	set spellsKnownProgressionFixed (val) { this._state.spellsKnownProgressionFixed = val; }
	set spellsKnownProgressionFixedAllowLowerLevel (val) { this._state.spellsKnownProgressionFixedAllowLowerLevel = val; }
	set spellsKnownProgressionFixedAllowHigherLevel (val) { this._state.spellsKnownProgressionFixedAllowHigherLevel = val; }

	addHookPulseFixedLearnedProgression (hk) { this._addHookBase("pulseFixedLearnedProgression", hk); }

	_doPulseFixedLearnedProgression () { this._state.pulseFixedLearnedProgression = !this._state.pulseFixedLearnedProgression; }

	render ($wrp) {
		const $wrpInner = $(`<div class="ve-flex-col w-100"></div>`).appendTo($wrp.empty());

		const hkIsVisible = () => $wrpInner.toggleVe(this._isAnyChoice());
		this._addHookBase("curLevel", hkIsVisible);
		this._addHookBase("targetLevel", hkIsVisible);
		this._addHookBase("casterProgression", hkIsVisible);
		this._addHookBase("spellsKnownProgressionFixed", hkIsVisible);
		this._addHookBase("spellsKnownProgressionFixedAllowLowerLevel", hkIsVisible);
		this._addHookBase("spellsKnownProgressionFixedAllowHigherLevel", hkIsVisible);
		this._addHookBase("spellsKnownProgression", hkIsVisible);
		hkIsVisible();

		const hkPopulateGenericKnownState = () => this._doPopulateGenericKnownState();
		this._addHookBase("curLevel", hkPopulateGenericKnownState);
		this._addHookBase("targetLevel", hkPopulateGenericKnownState);
		this._addHookBase("casterProgression", hkPopulateGenericKnownState);
		this._addHookBase("spellsKnownProgression", hkPopulateGenericKnownState);
		this._addHookBase("spellsKnownAllowLowerLevel", hkPopulateGenericKnownState);
		this._addHookBase("spellsKnownAllowHigherLevel", hkPopulateGenericKnownState);
		hkPopulateGenericKnownState();

		const hkPopulateFixedKnownState = () => this._doPopulateFixedKnownState();
		this._addHookBase("curLevel", hkPopulateFixedKnownState);
		this._addHookBase("targetLevel", hkPopulateFixedKnownState);
		this._addHookBase("casterProgression", hkPopulateFixedKnownState);
		this._addHookBase("spellsKnownProgressionFixed", hkPopulateFixedKnownState);
		this._addHookBase("spellsKnownProgressionFixedAllowLowerLevel", hkPopulateFixedKnownState);
		this._addHookBase("spellsKnownProgressionFixedAllowHigherLevel", hkPopulateFixedKnownState);
		hkPopulateFixedKnownState();

		const $btnToggle = $(`<div class="py-1 clickable ve-muted">[+]</div>`)
			.click(() => {
				$btnToggle.text($btnToggle.text() === "[+]" ? "[\u2012]" : "[+]");
				$stgBody.toggleVe();
			});

		const $rows = [...new Array(Consts.CHAR_MAX_LEVEL)].map((_, ixLvl) => {
			const lvl = ixLvl + 1;
			const $cellSpells = $(`<div class="col-10 ve-flex-v-center ve-flex-wrap"></div>`);

			const {propSpellLevelMax} = this.constructor._getPropsGeneral(lvl);
			const {propCnt: propCntGeneric} = this.constructor._getPropsLevel(lvl, "generic");
			const {propCnt: propCntFixed} = this.constructor._getPropsLevel(lvl, "fixed");

			const selMetasGeneric = [];
			const selMetasFixed = [];

			const $row = $$`<div class="ve-flex-v-center stripe-odd">
				<div class="col-2 text-center">${ixLvl + 1}</div>
				${$cellSpells}
			</div>`;

			const $dispNone = $(`<div>\u2014</div>`).appendTo($cellSpells);

			const hk = () => {
				let cntVisible = 0;

				// region Known spell progression
				cntVisible = cntVisible + this._hkRow_doAdjustElements({
					namespace: "generic",
					selMetas: selMetasGeneric,
					propCnt: propCntGeneric,
					propIsAllowLower: "spellsKnownAllowLowerLevel",
					propIsAllowHigher: "spellsKnownAllowHigherLevel",
					lvl,
					propSpellLevelMax,
					$cellSpells,
				});
				// endregion

				// region Fixed spells
				cntVisible = cntVisible + this._hkRow_doAdjustElements({
					namespace: "fixed",
					selMetas: selMetasFixed,
					propCnt: propCntFixed,
					propIsAllowLower: "spellsKnownProgressionFixedAllowLowerLevel",
					propIsAllowHigher: "spellsKnownProgressionFixedAllowHigherLevel",
					lvl,
					propSpellLevelMax,
					$cellSpells,
				});
				// endregion

				$dispNone.toggleVe(cntVisible === 0);

				$row.toggleVe(lvl > (this._state.curLevel ?? 0) && (this._state.targetLevel ?? 0) >= lvl);
			};
			this._addHookBase(propCntFixed, hk);
			this._addHookBase(propCntGeneric, hk);
			this._addHookBase(propSpellLevelMax, hk);
			this._addHookBase("curLevel", hk);
			this._addHookBase("targetLevel", hk);
			this._addHookBase("spellsKnownAllowLowerLevel", hk);
			this._addHookBase("spellsKnownAllowHigherLevel", hk);
			this._addHookBase("spellsKnownProgressionFixedAllowLowerLevel", hk);
			this._addHookBase("spellsKnownProgressionFixedAllowHigherLevel", hk);
			hk();

			return $row;
		});

		const $stgBody = $$`<div class="ve-flex-col w-100">
			<div class="ve-muted italic ve-small mb-1">If you wish to swap out learned spell levels for lower/higher (for example, when you swap out a spell on gaining a level as a Bard), you may do so here. Note that your final choices are not validated, so swap with caution, and according to the rules!</div>
			<div class="ve-flex-v-center">
				<div class="col-2 text-center">${this._className} Level</div>
				<div class="col-10">Learned Spell Levels</div>
			</div>
			${$rows}
		</div>`.toggleVe();

		$$($wrpInner)`<div class="ve-flex-col w-100">
			<div class="split-v-center">
				<div class="bold">Learned Slot Level</div>
				${$btnToggle}
			</div>

			${$stgBody}
		</div>`;
	}

	_hkRow_doAdjustElements ({namespace, propCnt, selMetas, lvl, propSpellLevelMax, $cellSpells, propIsAllowLower, propIsAllowHigher}) {
		let cntVisible = 0;

		const numSpellsAtLevel = this._state[propCnt];
		for (let i = 0, len = Math.max(numSpellsAtLevel, selMetas.length); i < len; ++i) {
			let selMeta = selMetas[i];

			if (i > numSpellsAtLevel) {
				selMeta.$sel.hideVe();
				selMeta.$dispStatic.hideVe();
				continue;
			}

			const {propSpellLevel} = this.constructor._getPropsSpell(lvl, namespace, i);

			if (!selMetas[i]) {
				selMeta = ComponentUiUtil.$getSelEnum(
					this,
					propSpellLevel,
					{
						values: this._geSpellLevelSelValues(propIsAllowLower, propIsAllowHigher, propSpellLevelMax),
						asMeta: true,
						fnDisplay: it => this.constructor._getSpellLevelDisplay(it),
					},
				);
				selMeta.$sel
					.addClass("manc-sp__sel-slot-level text-center p-0 clickable")
					.appendTo($cellSpells);
				selMetas[i] = selMeta;

				const hkSelTitle = () => selMeta.$sel.title(`You have selected to learn a ${this._state[propSpellLevel]}-level spell at this level.`);
				this._addHookBase(propSpellLevel, hkSelTitle);
				hkSelTitle();

				this._addHookBase(propSpellLevel, () => this._doPulseFixedLearnedProgression());

				// region Static alternative
				const $dispStatic = $(`<div class="ve-flex-vh-center manc-sp__sel-slot-level text-center ve-muted"></div>`).appendTo($cellSpells);
				const hkStatic = () => {
					$dispStatic.toggleVe(this._isShowStaticFixedValue(propIsAllowLower, propIsAllowHigher, propSpellLevelMax));
					$dispStatic
						.text(this.constructor._getSpellLevelDisplay(this._state[propSpellLevelMax]))
						.title(`This box indicates you will learn a ${this._state[propSpellLevelMax]}-level spell at this level.`);
				};
				this._addHookBase(propSpellLevel, hkStatic);
				this._addHookBase(propSpellLevelMax, hkStatic);
				this._addHookBase(propIsAllowLower, hkStatic);
				this._addHookBase(propIsAllowHigher, hkStatic);
				this._addHookBase("curLevel", hkStatic);
				this._addHookBase("targetLevel", hkStatic);
				hkStatic();

				selMeta.$dispStatic = $dispStatic;
				// endregion

				const hkMaxSpellLevel = () => {
					selMeta.setValues(this._geSpellLevelSelValues(propIsAllowLower, propIsAllowHigher, propSpellLevelMax));
				};
				this._addHookBase(propSpellLevelMax, hkMaxSpellLevel);
				this._addHookBase(propIsAllowLower, hkMaxSpellLevel);
				this._addHookBase(propIsAllowHigher, hkMaxSpellLevel);
				this._addHookBase("curLevel", hkMaxSpellLevel);
				this._addHookBase("targetLevel", hkMaxSpellLevel);
			}

			cntVisible++;

			const isShowStatic = this._isShowStaticFixedValue(propIsAllowLower, propIsAllowHigher, propSpellLevelMax);
			selMeta.$sel.toggleVe(!isShowStatic);
			selMeta.$dispStatic.toggleVe(isShowStatic);
		}

		return cntVisible;
	}

	static _getSpellLevelDisplay (lvl) { return `${Parser.getOrdinalForm(lvl)}-level sp.`; }

	static _getPropsSpell (lvl, namespace, ix) {
		return {
			propSpellLevel: `${lvl}_${namespace}_${ix}_spellLevel`,
		};
	}

	static _getPropsLevel (lvl, namespace) {
		return {
			propCnt: `${lvl}_${namespace}_cntFixed`,
		};
	}

	static _getPropsGeneral (lvl) {
		return {
			propSpellLevelMax: `${lvl}_spellLevelMax`,
		};
	}

	_isAnyChoice () {
		if (this._state.curLevel == null || this._state.targetLevel == null || this._state.casterProgression == null) return false;

		return !!(
			(this._state.spellsKnownProgressionFixed && (this._state.spellsKnownProgressionFixedAllowLowerLevel || this._state.spellsKnownProgressionFixedAllowHigherLevel))
			|| (this._state.spellsKnownProgression && (this._state.spellsKnownAllowLowerLevel || this._state.spellsKnownAllowHigherLevel))
		);
	}

	_geSpellLevelSelValues (propIsAllowLower, propIsAllowHigher, propSpellLevelMax) {
		const maxSpellLevel = Charactermancer_Spell_Util.getCasterProgressionMeta({
			casterProgression: this._state.casterProgression,
			curLevel: this._state.curLevel,
			targetLevel: this._state.targetLevel,
		})?.spellLevelHigh || 0;

		const min = this._state[propIsAllowLower] ? 1 : maxSpellLevel;
		const max = this._state[propIsAllowHigher] ? maxSpellLevel : this._state[propSpellLevelMax];

		const out = [];
		for (let i = min; i <= max; ++i) out.push(i);
		return out;
	}

	_doPopulateGenericKnownState () {
		[...new Array(Consts.CHAR_MAX_LEVEL)].forEach((_, ixLvl) => this._doPopulateGenericKnownState_forLevel(ixLvl + 1));

		this._doPulseFixedLearnedProgression();
	}

	_doPopulateGenericKnownState_forLevel (lvl) {
		if (this._doPopulateState_forLevel_isDoReset() || !this._state.spellsKnownProgression) {
			this._doPopulateState_forLevel_doReset({lvl, namespace: "generic"});
			return;
		}

		const prevCntSpells = this._state.spellsKnownProgression[lvl - 2] || 0;
		const curCntSpells = this._state.spellsKnownProgression[lvl - 1] || 0;
		const numSpells = curCntSpells - prevCntSpells;

		this._doPopulateState_forLevel_doPopulateForNumSpells({
			lvl,
			namespace: "generic",
			numSpells,
			propIsAllowLower: "spellsKnownAllowLowerLevel",
			propIsAllowHigher: "spellsKnownAllowHigherLevel",
		});
	}

	_doPopulateState_forLevel_isDoReset () {
		return this._state.curLevel == null || this._state.targetLevel == null || this._state.casterProgression == null || UtilDataConverter.CASTER_TYPE_TO_PROGRESSION[this._state.casterProgression] == null;
	}

	_doPopulateState_forLevel_doReset ({lvl, namespace}) {
		const {propCnt} = this.constructor._getPropsLevel(lvl, namespace);
		this._state[propCnt] = null;
	}

	_doPopulateState_forLevel_doPopulateForNumSpells ({lvl, namespace, numSpells, propIsAllowLower, propIsAllowHigher}) {
		const maxSpellLevel = Charactermancer_Spell_Util.getCasterProgressionMeta({
			casterProgression: this._state.casterProgression,
			curLevel: 0,
			targetLevel: lvl,
		})?.spellLevelHigh || 0;

		[...new Array(numSpells)].map((_, i) => {
			const {propSpellLevel} = this.constructor._getPropsSpell(lvl, namespace, i);

			if (this._state[propSpellLevel] == null) this._state[propSpellLevel] = maxSpellLevel;
			else {
				let nxtVal = this._state[propSpellLevel];

				// Clamp the current value to the maximum spell level from above or below, depending
				if (!this._state[propIsAllowLower]) nxtVal = Math.max(nxtVal, maxSpellLevel);
				if (!this._state[propIsAllowHigher]) nxtVal = Math.min(nxtVal, maxSpellLevel);

				this._state[propSpellLevel] = nxtVal;
			}
		});

		const {propCnt} = this.constructor._getPropsLevel(lvl, namespace);
		this._state[propCnt] = numSpells;

		const {propSpellLevelMax} = this.constructor._getPropsGeneral(lvl);
		this._state[propSpellLevelMax] = maxSpellLevel;
	}

	_doPopulateFixedKnownState () {
		[...new Array(Consts.CHAR_MAX_LEVEL)].forEach((_, ixLvl) => this._doPopulateFixedKnownState_forLevel(ixLvl + 1));

		this._doPulseFixedLearnedProgression();
	}

	_doPopulateFixedKnownState_forLevel (lvl) {
		if (this._doPopulateState_forLevel_isDoReset() || !this._state.spellsKnownProgressionFixed) {
			this._doPopulateState_forLevel_doReset({lvl, namespace: "fixed"});
			return;
		}

		const numSpells = this._state.spellsKnownProgressionFixed[lvl - 1] || 0;
		this._doPopulateState_forLevel_doPopulateForNumSpells({
			lvl,
			namespace: "fixed",
			numSpells,
			propIsAllowLower: "spellsKnownProgressionFixedAllowLowerLevel",
			propIsAllowHigher: "spellsKnownProgressionFixedAllowHigherLevel",
		});
	}

	_isShowStaticFixedValue (propIsAllowLower, propIsAllowHigher, propSpellLevelMax) {
		const maxSpellLevel = Charactermancer_Spell_Util.getCasterProgressionMeta({
			casterProgression: this._state.casterProgression,
			curLevel: this._state.curLevel,
			targetLevel: this._state.targetLevel,
		})?.spellLevelHigh || 0;
		if (maxSpellLevel <= 1) return true;

		const isAllowLower = this._state[propIsAllowLower] && this._state[propSpellLevelMax] !== 1;
		const isAllowHigher = this._state[propIsAllowHigher] && this._state[propSpellLevelMax] !== 9;
		return !isAllowLower && !isAllowHigher;
	}

	/** As per `getFormData`, but we assume the user never customized their slot selection. */
	static getDefaultFormData ({targetLevel, casterProgression, spellsKnownProgression, spellsKnownProgressionFixed}) {
		const out = [...new Array(9)].map(() => 0);
		let isAnyData = false;

		if (spellsKnownProgression && targetLevel != null && casterProgression) {
			isAnyData = true;
			this._getFormData_handleKnownProgressionGeneric_noChoice(out, {targetLevel, casterProgression, spellsKnownProgression});
		}

		if (spellsKnownProgressionFixed && targetLevel != null && casterProgression) {
			isAnyData = true;
			this._getFormData_handleKnownProgressionFixed_noChoice(out, {targetLevel, casterProgression, spellsKnownProgressionFixed});
		}

		return {
			isFormComplete: true,
			isAnyData,
			data: out,
		};
	}

	getFormData () {
		const out = [...new Array(9)].map(() => 0);
		let isAnyData = false;

		if (this._state.spellsKnownProgression && this._state.targetLevel != null && this._state.casterProgression) {
			isAnyData = true;
			this._getFormData_handleKnownProgressionGeneric(out);
		}

		if (this._state.spellsKnownProgressionFixed && this._state.targetLevel != null && this._state.casterProgression) {
			isAnyData = true;
			this._getFormData_handleKnownProgressionFixed(out);
		}

		return {
			isFormComplete: true,
			isAnyData,
			data: out,
		};
	}

	_getFormData_handleKnownProgressionGeneric (totalKnownPerLevel) {
		if (!this._state.spellsKnownAllowLowerLevel && !this._state.spellsKnownAllowHigherLevel) {
			this.constructor._getFormData_handleKnownProgressionGeneric_noChoice(
				totalKnownPerLevel,
				{
					targetLevel: this._state.targetLevel,
					casterProgression: this._state.casterProgression,
					spellsKnownProgression: this._state.spellsKnownProgression,
				},
			);
		} else this._getFormData_handleKnownProgressionGeneric_choice(totalKnownPerLevel);
	}

	_getFormData_handleKnownProgressionFixed (totalKnownPerLevel) {
		if (!this._state.spellsKnownProgressionFixedAllowLowerLevel && this._state.spellsKnownProgressionFixedAllowHigherLevel) {
			this.constructor._getFormData_handleKnownProgressionFixed_noChoice(
				totalKnownPerLevel,
				{
					targetLevel: this._state.targetLevel,
					casterProgression: this._state.casterProgression,
					spellsKnownProgressionFixed: this._state.spellsKnownProgressionFixed,
				},
			);
		} else this._getFormData_handleKnownProgressionFixed_choice(totalKnownPerLevel);
	}

	static _getFormData_handleKnownProgressionGeneric_noChoice (totalKnownPerLevel, {targetLevel, casterProgression, spellsKnownProgression}) {
		[...new Array(targetLevel)]
			.forEach((_, i) => {
				const maxSpellLevel = Charactermancer_Spell_Util.getCasterProgressionMeta({
					casterProgression: casterProgression,
					curLevel: 0,
					targetLevel: i + 1,
				})?.spellLevelHigh || 0;

				const ixLastSlot = maxSpellLevel - 1;
				if (ixLastSlot < 0) return;

				const prevCntSpells = spellsKnownProgression[i - 1] || 0;
				const curCntSpells = spellsKnownProgression[i] || 0;
				const numSpells = curCntSpells - prevCntSpells;

				// Add the number of spells known to our total for this level
				totalKnownPerLevel[ixLastSlot] += numSpells;
			});
	}

	_getFormData_handleKnownProgressionGeneric_choice (totalKnownPerLevel) {
		this._getFormData_handleKnownProgression_choice({
			namespace: "generic",
			totalKnownPerLevel,
			propIsAllowLower: "spellsKnownAllowLowerLevel",
			propIsAllowHigher: "spellsKnownAllowHigherLevel",
		});
	}

	static _getFormData_handleKnownProgressionFixed_noChoice (totalKnownPerLevel, {targetLevel, casterProgression, spellsKnownProgressionFixed}) {
		spellsKnownProgressionFixed.slice(0, targetLevel)
			.forEach((lvlFixedValue, i) => {
				const maxSpellLevel = Charactermancer_Spell_Util.getCasterProgressionMeta({
					casterProgression: casterProgression,
					curLevel: 0,
					targetLevel: i + 1,
				})?.spellLevelHigh || 0;

				const ixLastSlot = maxSpellLevel - 1;
				if (ixLastSlot < 0) return;

				// Add the number of spells known to our total for this level
				totalKnownPerLevel[ixLastSlot] += lvlFixedValue;
			});
	}

	_getFormData_handleKnownProgressionFixed_choice (totalKnownPerLevel) {
		this._getFormData_handleKnownProgression_choice({
			namespace: "fixed",
			totalKnownPerLevel,
			propIsAllowLower: "spellsKnownProgressionFixedAllowLowerLevel",
			propIsAllowHigher: "spellsKnownProgressionFixedAllowHigherLevel",
		});
	}

	_getFormData_handleKnownProgression_choice ({namespace, totalKnownPerLevel, propIsAllowLower, propIsAllowHigher}) {
		const maxOverallSpellLevel = Charactermancer_Spell_Util.getCasterProgressionMeta({
			casterProgression: this._state.casterProgression,
			curLevel: this._state.curLevel,
			targetLevel: this._state.targetLevel,
		})?.spellLevelHigh || 0;

		[...new Array(this._state.targetLevel)]
			.map((_, ixLvl) => {
				const lvl = ixLvl + 1;

				const maxSpellLevel = Charactermancer_Spell_Util.getCasterProgressionMeta({
					casterProgression: this._state.casterProgression,
					curLevel: 0,
					targetLevel: lvl,
				})?.spellLevelHigh || 0;

				const {propCnt} = this.constructor._getPropsLevel(lvl, namespace);

				const numSpells = this._state[propCnt];
				for (let i = 0; i < numSpells; ++i) {
					const {propSpellLevel} = this.constructor._getPropsSpell(lvl, namespace, i);

					let spellLevel = this._state[propSpellLevel];

					// Clamp the current value to the maximum spell level from above or below, depending
					if (!this._state[propIsAllowLower]) spellLevel = Math.max(spellLevel, maxSpellLevel);
					if (!this._state[propIsAllowHigher]) spellLevel = Math.min(spellLevel, maxSpellLevel);

					// Clamp to the max spell level this class can access at this level
					spellLevel = Math.min(spellLevel, maxOverallSpellLevel);

					totalKnownPerLevel[spellLevel - 1]++;
				}
			});
	}

	_getDefaultState () {
		return {
			curLevel: null,
			targetLevel: null,

			casterProgression: null,

			spellsKnownProgression: null,
			spellsKnownAllowLowerLevel: true, // This is a dummy value, to match the "fixed" version
			spellsKnownAllowHigherLevel: true, // (As above)

			spellsKnownProgressionFixed: null,
			spellsKnownProgressionFixedAllowLowerLevel: false,
			spellsKnownProgressionFixedAllowHigherLevel: false,

			pulseFixedLearnedProgression: false,
		};
	}
}

export {Charactermancer_Spell_Util, Charactermancer_Spell_SlotLevelSelect};
