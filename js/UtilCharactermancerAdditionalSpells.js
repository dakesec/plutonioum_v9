import {ModalFilterSpellsFvtt} from "./UtilModalFilter.js";
import {UtilApplications} from "./UtilApplications.js";
import {LGT} from "./Util.js";

class Charactermancer_AdditionalSpellsUtil {
	// region Data flattening
	static getFlatData (additionalSpells) {
		additionalSpells = MiscUtil.copy(additionalSpells);

		return additionalSpells.map(additionalSpellBlock => {
			const outMeta = {};
			const outSpells = {};

			const keyPath = [];

			Object.entries(additionalSpellBlock).forEach(([additionType, additionMeta]) => {
				keyPath.push(additionType);

				switch (additionType) {
					// Special cases
					case "name":
					case "ability": outMeta[additionType] = additionMeta; break;

					// This is passed directly in to the spell flattener; skip it here
					case "resourceName": break;

					case "innate":
					case "known":
					case "prepared":
					case "expanded": {
						this._getFlatData_doProcessAdditionMeta({additionType, additionMeta, outSpells, keyPath, resourceName: additionalSpellBlock.resourceName});
						break;
					}

					default: throw new Error(`Unhandled spell addition type "${additionType}"`);
				}

				keyPath.pop();
			});

			return {meta: outMeta, spells: outSpells};
		});
	}

	static _getFlatData_doProcessAdditionMeta (opts) {
		const {additionMeta, keyPath} = opts;

		Object.entries(additionMeta).forEach(([levelOrCasterLevel, levelMeta]) => {
			keyPath.push(levelOrCasterLevel);

			if (levelMeta instanceof Array) {
				levelMeta.forEach((spellItem, ix) => this._getFlatData_doProcessSpellItem({...opts, levelOrCasterLevel, spellItem, ix}));
			} else {
				Object.entries(levelMeta).forEach(([rechargeType, levelMetaInner]) => {
					this._getFlatData_doProcessSpellRechargeBlock({...opts, levelOrCasterLevel, rechargeType, levelMetaInner});
				});
			}

			keyPath.pop();
		});
	}

	static _getFlatData_doProcessSpellItem (opts) {
		const {additionType, additionMeta, outSpells, keyPath, spellItem, ix, rechargeType, uses, usesPer, levelOrCasterLevel, consumeType, consumeAmount, consumeTarget, vetConsumes} = opts;

		keyPath.push(ix);

		const outSpell = {
			isExpanded: additionType === "expanded",
			isAlwaysPrepared: additionType === "prepared",
			isAlwaysKnown: additionType === "known",
			isPrepared: additionType === "prepared" || additionType === "innate" || additionType === "known",
			preparationMode: (additionType === "prepared" || additionType === "known") ? "always" : "innate",
			consumeType,
			consumeAmount,
			consumeTarget,
			vetConsumes,
		};

		if (levelOrCasterLevel !== "_") { // "_" is effectively "gained at the level you gain this feature"
			const mCasterLevel = /^s(\d+)$/.exec(levelOrCasterLevel);
			if (mCasterLevel) outSpell.requiredCasterLevel = Number(mCasterLevel[1]);
			else if (!isNaN(levelOrCasterLevel)) outSpell.requiredLevel = Number(levelOrCasterLevel);
		}

		if (rechargeType) {
			switch (rechargeType) {
				case "rest":
				case "daily": break; // (Use the above defaults)

				case "will":
				case "ritual":
				case "resource": {
					outSpell.preparationMode = "atwill";
					outSpell.isPrepared = rechargeType !== "ritual";
					break;
				}

				case "_": break;

				default: throw new Error(`Unhandled recharge type "${rechargeType}"`);
			}
		}

		if (uses) outSpell.uses = uses;
		if (usesPer) outSpell.usesPer = usesPer;

		if (typeof spellItem === "string") {
			const key = keyPath.join("__");

			outSpells[key] = new Charactermancer_AdditionalSpellsUtil.FlatSpell({
				type: "spell",

				key,
				...outSpell,
				uid: spellItem,
			});
		} else {
			if (spellItem.choose != null) {
				if (typeof spellItem.choose === "string") { // A filter expression
					const count = spellItem.count || 1;

					for (let i = 0; i < count; ++i) {
						keyPath.push(i);

						const key = keyPath.join("__");

						outSpells[key] = new Charactermancer_AdditionalSpellsUtil.FlatSpell({
							type: "choose",

							key,
							...outSpell,
							filterExpression: spellItem.choose,
						});

						keyPath.pop();
					}
				} else if (spellItem.choose.from) { // An array of choices
					const count = spellItem.choose.count || 1;

					const groupId = CryptUtil.uid();
					[...spellItem.choose.from]
						.sort((a, b) => SortUtil.ascSortLower(a, b))
						.forEach((uid, i) => {
							keyPath.push(i);

							const key = keyPath.join("__");

							outSpells[key] = new Charactermancer_AdditionalSpellsUtil.FlatSpell({
								type: "chooseFrom",

								key,
								...outSpell,
								uid: uid,
								chooseFromGroup: groupId,
								chooseFromCount: count,
							});

							keyPath.pop();
						});
				} else {
					throw new Error(`Unhandled additional spell format: "${JSON.stringify(spellItem)}"`);
				}
			} else throw new Error(`Unhandled additional spell format: "${JSON.stringify(spellItem)}"`);
		}

		keyPath.pop();
	}

	static _getFlatData_doProcessSpellRechargeBlock (opts) {
		const {additionType, additionMeta, outSpells, keyPath, resourceName, levelOrCasterLevel, rechargeType, levelMetaInner} = opts;

		keyPath.push(rechargeType);

		switch (rechargeType) {
			case "rest":
			case "daily": {
				const usesPer = rechargeType === "rest" ? "sr" : "lr";

				Object.entries(levelMetaInner)
					.forEach(([numTimesCast, spellList]) => {
						keyPath.push(numTimesCast);

						// Convert any e.g. "1e" to "1"
						numTimesCast = numTimesCast.replace(/^(\d+)e$/, "$1");
						const uses = Number(numTimesCast);

						spellList.forEach((spellItem, ix) => this._getFlatData_doProcessSpellItem({...opts, spellItem, ix, uses, usesPer}));

						keyPath.pop();
					});

				break;
			}

			case "resource": {
				Object.entries(levelMetaInner)
					.forEach(([consumeAmount, spellList]) => {
						keyPath.push(consumeAmount);

						spellList.forEach((spellItem, ix) => this._getFlatData_doProcessSpellItem({...opts, spellItem, ix, vetConsumes: {name: resourceName, amount: Number(consumeAmount)}}));

						keyPath.pop();
					});

				break;
			}

			case "will":
			case "ritual":
			case "_": {
				levelMetaInner.forEach((spellItem, ix) => this._getFlatData_doProcessSpellItem({...opts, spellItem, ix}));
				break;
			}

			default: throw new Error(`Unhandled spell recharge type "${rechargeType}"`);
		}

		keyPath.pop();
	}
	// endregion
}

Charactermancer_AdditionalSpellsUtil.FlatSpell = class {
	/**
	 * @param opts.type `"spell"`, `"choose"`, or "chooseFrom"
	 * @param opts.key
	 * @param opts.isExpanded
	 * @param opts.isPrepared
	 * @param opts.isAlwaysKnown
	 * @param opts.isAlwaysPrepared
	 * @param opts.preparationMode
	 * @param [opts.requiredCasterLevel]
	 * @param [opts.requiredLevel]
	 *
	 * @param opts.uses
	 * @param opts.usesPer
	 *
	 * @param [opts.consumeType]
	 * @param [opts.consumeAmount]
	 * @param [opts.consumeTarget]
	 *
	 * @param [opts.vetConsumes] 5etools-style "consumes" data, of the form `{"name": "...", "amount": 1}`
	 *
	 * @param [opts.uid]
	 *
	 * @param [opts.filterExpression]
	 *
	 * @param [opts.chooseFromGroup] UUID of the choose-from group this spell belongs to.
	 * @param [opts.chooseFromCount] Number of choices in the choose-from group this spell belongs to.
	 */
	constructor (opts) {
		this.type = opts.type;
		this.key = opts.key;
		this.isExpanded = opts.isExpanded; // This is an "expanded spell list" spell, which doesn't get added
		this.isPrepared = opts.isPrepared;
		this.isAlwaysKnown = opts.isAlwaysKnown;
		this.isAlwaysPrepared = opts.isAlwaysPrepared;
		this.preparationMode = opts.preparationMode;
		this.requiredCasterLevel = opts.requiredCasterLevel;
		this.requiredLevel = opts.requiredLevel;

		this.uses = opts.uses;
		this.usesPer = opts.usesPer;

		this.consumeType = opts.consumeType;
		this.consumeAmount = opts.consumeAmount;
		this.consumeTarget = opts.consumeTarget;

		this.vetConsumes = opts.vetConsumes;

		this.isCantrip = false;

		// region Simple spells
		// Ensure the UID is of the form: `"name|source"`
		this.uid = null;
		this.castAtLevel = null;
		if (opts.uid) {
			const {uid, isCantrip, castAtLevel} = Charactermancer_AdditionalSpellsUtil.FlatSpell._getExpandedUid(opts.uid);
			this.uid = uid;
			this.isCantrip = isCantrip;
			this.castAtLevel = castAtLevel;
		}
		// endregion

		// region Choose expressions
		this.filterExpression = opts.filterExpression;
		if (opts.filterExpression && opts.filterExpression.split("|").filter(Boolean).some(it => /^level=0$/i.test(it.trim()))) {
			this.isCantrip = true;
		}
		// endregion

		// region Choose from
		this.chooseFromGroup = opts.chooseFromGroup;
		this.chooseFromCount = opts.chooseFromCount;
		// endregion

		// Ensure legacy (i.e., note `"known"` prop) cantrips are counted as "always known"
		if (this.isCantrip && !this.isExpanded) this.isAlwaysKnown = true;
	}

	static _getExpandedUid (uidRaw) {
		const [uidPart, castAtLevelPart] = uidRaw.split("#").map(it => it.trim()).filter(Boolean);

		let [name, source] = Renderer.splitTagByPipe(uidPart.toLowerCase());
		source = source || SRC_PHB.toLowerCase();
		const uid = `${name}|${source}`;

		const isCantrip = castAtLevelPart && castAtLevelPart.toLowerCase() === "c";
		const castAtLevel = isCantrip ? null : (castAtLevelPart && !isNaN(castAtLevelPart)) ? Number(castAtLevelPart) : null;

		return {uid, isCantrip, castAtLevel};
	}
};

class Charactermancer_AdditionalSpellsSelect extends BaseComponent {
	// region External
	/**
	 * @param opts
	 * @param opts.additionalSpells
	 * @param [opts.sourceHintText]
	 *
	 * @param opts.curLevel
	 * @param opts.targetLevel
	 * @param opts.spellLevelLow
	 * @param opts.spellLevelHigh
	 *
	 * @param opts.isStandalone If this is a "standalone" spell instance, and so should skip e.g. expanded spell lists.
	 */
	static async pGetUserInput (opts) {
		opts = opts || {};
		const {additionalSpells} = opts;

		if (!additionalSpells || !additionalSpells.length) return {isFormComplete: true, data: []};

		const comp = this.getComp(opts);

		if (comp.isNoChoice({curLevel: opts.curLevel, targetLevel: opts.targetLevel, isStandalone: opts.isStandalone})) return comp.pGetFormData();

		return UtilApplications.pGetImportCompApplicationFormData({
			comp,
			width: 640,
			height: 220,
		});
	}

	/**
	 * @param opts
	 * @param opts.additionalSpells
	 * @param [opts.sourceHintText]
	 * @param [opts.modalFilterSpells]
	 *
	 * @param opts.curLevel
	 * @param opts.targetLevel
	 * @param opts.spellLevelLow
	 * @param opts.spellLevelHigh
	 * @param opts.isAnyCantrips
	 */
	static getComp (opts) {
		opts = opts || {};

		const modalFilterSpells = opts.modalFilterSpells || new ModalFilterSpellsFvtt({namespace: "Charactermancer_AdditionalSpellsSelect.spells", isRadio: true});

		const comp = new this({...opts, modalFilterSpells});
		comp.curLevel = opts.curLevel;
		comp.targetLevel = opts.targetLevel;
		comp.spellLevelLow = opts.spellLevelLow;
		comp.spellLevelHigh = opts.spellLevelHigh;
		comp.isAnyCantrips = !!opts.isAnyCantrips;

		return comp;
	}

	/**
	 *
	 * @param actor
	 * @param formData
	 * @param [opts]
	 * @param [opts.abilityAbv]
	 * @param [opts.parentAbilityAbv] If the ability is "inherit", this is used instead
	 */
	static async pApplyFormDataToActor (actor, formData, opts) {
		opts = opts || {};

		if (!formData || !formData?.data?.length) return;

		const ability = ((opts.abilityAbv === "inherit" ? opts.parentAbilityAbv : opts.abilityAbv) || (formData.abilityAbv === "inherit" ? opts.parentAbilityAbv : formData.abilityAbv)) ?? undefined;

		const {ImportListSpell} = await import("./ImportListSpell.js");
		const importListSpell = new ImportListSpell({actor});

		for (const spellMeta of formData.data) {
			// Skip "expanded spell list" spells
			if (spellMeta.isExpanded) continue;

			let [name, source] = spellMeta.uid.split("|");
			if (!source) source = SRC_PHB;
			const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_SPELLS]({name, source});

			const spell = await Renderer.hover.pCacheAndGet(UrlUtil.PG_SPELLS, source, hash);
			if (!spell) {
				const message = `Could not find spell "${hash}" when applying additional spells!`;
				ui.notifications.warn(message);
				console.warn(...LGT, message);
				continue;
			}

			await importListSpell.pImportEntry(
				spell,
				{
					opts_pGetSpellItem: {
						ability,
						usesMax: spellMeta.uses,
						usesValue: spellMeta.uses,
						usesPer: spellMeta.usesPer,
						consumeType: spellMeta.consumeType,
						consumeAmount: spellMeta.consumeAmount,
						consumeTarget: spellMeta.consumeTarget,
						vetConsumes: spellMeta.vetConsumes,
						isPrepared: spellMeta.isPrepared,
						preparationMode: spellMeta.preparationMode,
						castAtLevel: spellMeta.castAtLevel,

						// Never use an existing spell when adding additional spells
						isIgnoreExisting: true,
					},
				},
			);
		}
	}

	static isNoChoice (additionalSpells, {additionalSpellsFlat = null, curLevel = null, targetLevel = null, isStandalone = false} = {}) {
		if (additionalSpells.length !== 1) return false;
		additionalSpellsFlat = additionalSpellsFlat || Charactermancer_AdditionalSpellsUtil.getFlatData(additionalSpells);

		const minLevel = curLevel ?? Number.MIN_SAFE_INTEGER;
		const maxLevel = targetLevel ?? Number.MAX_SAFE_INTEGER;

		const spellsInRange = additionalSpellsFlat.some(it => Object.values(it.spells)
			.some(it => (!isStandalone || !it.isExpanded) && (it.requiredLevel == null || (it.requiredLevel >= minLevel && it.requiredLevel <= maxLevel))),
		);

		if (!spellsInRange) return true;

		return !additionalSpellsFlat.some(it => it.meta.ability?.choose || Object.values(it.spells).some(it => it.filterExpression != null || it.chooseFromGroup != null));
	}
	// endregion

	/**
	 * @param opts
	 * @param opts.additionalSpells
	 * @param [opts.sourceHintText]
	 * @param opts.modalFilterSpells
	 */
	constructor (opts) {
		opts = opts || {};
		super();

		this._additionalSpells = opts.additionalSpells;
		this._sourceHintText = opts.sourceHintText;
		this._modalFilterSpells = opts.modalFilterSpells;

		this._additionalSpellsFlat = Charactermancer_AdditionalSpellsUtil.getFlatData(opts.additionalSpells);
	}

	get modalTitle () { return `Choose Additional Spell Set${this._sourceHintText ? ` (${this._sourceHintText})` : ""}`; }

	set curLevel (val) { this._state.curLevel = val; }
	set targetLevel (val) { this._state.targetLevel = val; }
	set spellLevelLow (val) { this._state.spellLevelLow = val; }
	set spellLevelHigh (val) { this._state.spellLevelHigh = val; }
	set isAnyCantrips (val) { this._state.isAnyCantrips = !!val; }

	// region Expose "expanded spell lists" to be added to main spell selection components
	addHookAlwaysPreparedSpells (hk) { this._addHookBase("spellsAlwaysPrepared", hk); }
	addHookExpandedSpells (hk) { this._addHookBase("spellsExpanded", hk); }
	addHookAlwaysKnownSpells (hk) { this._addHookBase("spellsAlwaysKnown", hk); }

	get spellsAlwaysPrepared () { return this._state.spellsAlwaysPrepared; }
	get spellsExpanded () { return this._state.spellsExpanded; }
	get spellsAlwaysKnown () { return this._state.spellsAlwaysKnown; }

	_render_addLastAlwaysPreparedSpellsHook () { return this._render_addLastBoolSpellsHook({propState: "spellsAlwaysPrepared", propIsBool: "isAlwaysPrepared"}); }
	_render_addLastExpandedSpellsHook () { return this._render_addLastBoolSpellsHook({propState: "spellsExpanded", propIsBool: "isExpanded"}); }
	_render_addLastAlwaysKnownSpellsHook () { return this._render_addLastBoolSpellsHook({propState: "spellsAlwaysKnown", propIsBool: "isAlwaysKnown"}); }

	_render_addLastBoolSpellsHook ({propState, propIsBool}) {
		const hk = () => {
			const formData = this.getFormData();
			const nxt = formData.data.filter(it => it[propIsBool]).map(it => it.uid.toLowerCase());

			const setCurr = new Set(this._state[propState]);
			const setNxt = new Set(nxt);
			if (!CollectionUtil.setEq(setCurr, setNxt)) this._state[propState] = nxt;
		};
		this._addHookBase("ixSet", hk);
		this._addHookBase("curLevel", hk);
		this._addHookBase("targetLevel", hk);
		this._addHookBase("spellLevelLow", hk);
		this._addHookBase("spellLevelHigh", hk);
		this._addHookBase("isAnyCantrips", hk);
		this._addHookBase("pulseChoose", hk);
		hk();
	}
	// endregion

	render ($wrp) {
		this._render_addLastAlwaysPreparedSpellsHook();
		this._render_addLastExpandedSpellsHook();
		this._render_addLastAlwaysKnownSpellsHook();

		const $wrpOptionsButtons = $(`<div class="ve-flex-v-center ve-flex-wrap w-100 btn-group ${this._additionalSpellsFlat.length > 1 ? "mb-1" : ""}"></div>`);
		const $wrpOptions = $(`<div class="ve-flex-col w-100"></div>`);

		for (let i = 0; i < this._additionalSpellsFlat.length; ++i) this._render_renderOptions($wrpOptionsButtons, $wrpOptions, i);

		$$($wrp)`
			${$wrpOptionsButtons}
			${$wrpOptions}
		`;
	}

	_render_renderOptions ($wrpOptionsButtons, $wrpOptions, ix) {
		const additionalSpellsFlatBlock = this._additionalSpellsFlat[ix];

		// N.b. this is inconsistent with all the other "select a set" controls, which are done with
		//   `ComponentUiUtil.$getSelEnum`. We use buttons here because it looks cooler, and our spell set names
		//   _generally_ aren't super-long strings. If this becomes problematic in future, switch it to a simple $sel.
		const $btnSelect = this._additionalSpellsFlat.length === 1
			? null
			: $(`<button class="btn btn-xs ve-flex-1" title="Select Spell Set">${additionalSpellsFlatBlock.meta.name ?? `Spell Set ${ix + 1}`}</button>`)
				.click(() => this._state.ixSet = ix);

		// FIXME(Future) this is a leaky abstraction. In reality, there are four types of spells we should split out:
		//   - innate/prepared at class level
		//   - innate/prepared at spellcasting level
		//   - expanded at class level
		//   - expanded at spellcasting level
		//  Currently, we group together class and spellcasting level, since there are no examples
		//  (as of 2021-01-16) in official data of some race/subclass/etc. providing a mixture of both.
		const isInnatePreparedList = this._isAnyInnatePrepared(ix);
		const isExpandedList = this._isAnyExpanded(ix);

		const sortedSpells = Object.values(additionalSpellsFlatBlock.spells)
			.sort((a, b) => SortUtil.ascSort(a.requiredLevel || 0, b.requiredLevel || 0) || SortUtil.ascSort(a.requiredCasterLevel || 0, b.requiredCasterLevel || 0));

		const $wrpInnatePreparedHeaders = isInnatePreparedList ? $(`<div class="ve-flex-v-center py-1">
			<div class="col-3 text-center">Level</div>
			<div class="col-9">Spells</div>
		</div>`) : null;

		const $wrpExpandedHeaders = isExpandedList ? $(`<div class="ve-flex-v-center py-1">
			<div class="col-3 text-center">Spell Level</div>
			<div class="col-9">Spells</div>
		</div>`) : null;

		const $rowsInnatePrepared = isInnatePreparedList ? this._render_$getRows(ix, sortedSpells, {isExpandedMatch: false}) : null;
		const $rowsExpanded = isExpandedList ? this._render_$getRows(ix, sortedSpells, {isExpandedMatch: true}) : null;

		const $wrpNoneAvailableInnatePrepared = isInnatePreparedList ? $(`<div class="ve-small ve-flex-v-center my-1 w-100 italic ve-muted">No spells at this level</div>`) : null;
		const $wrpNoneAvailableExpanded = isExpandedList ? $(`<div class="ve-small ve-flex-v-center my-1 w-100 italic ve-muted">No spells at this level</div>`) : null;

		const hkSpellsAvailable = () => {
			const isInnatePreparedAvailable = !!this._getFlatInnatePreparedSpellsInRange(ix).length;
			if ($wrpInnatePreparedHeaders) $wrpInnatePreparedHeaders.toggleVe(isInnatePreparedAvailable);
			if ($wrpNoneAvailableInnatePrepared) $wrpNoneAvailableInnatePrepared.toggleVe(!isInnatePreparedAvailable);

			const isExpandedAvailable = !!this._getFlatExpandedSpellsInRange(ix).length;
			if ($wrpExpandedHeaders) $wrpExpandedHeaders.toggleVe(isExpandedAvailable);
			if ($wrpNoneAvailableExpanded) $wrpNoneAvailableExpanded.toggleVe(!isExpandedAvailable);
		};
		this._addHookBase("spellLevelLow", hkSpellsAvailable);
		this._addHookBase("spellLevelHigh", hkSpellsAvailable);
		this._addHookBase("isAnyCantrips", hkSpellsAvailable);
		this._addHookBase("curLevel", hkSpellsAvailable);
		this._addHookBase("targetLevel", hkSpellsAvailable);
		this._addHookBase("ixSet", hkSpellsAvailable);
		hkSpellsAvailable();

		const $stgInnatePrepared = isInnatePreparedList ? $$`<div class="ve-flex-col">
			<div class="bold my-0">Innate/Prepared/Known Spells</div>
			${$wrpInnatePreparedHeaders}
			${$rowsInnatePrepared}
			${$wrpNoneAvailableInnatePrepared}
		</div>` : null;

		const $stgExpanded = isExpandedList ? $$`<div class="ve-flex-col">
			<div class="bold my-0">Expanded Spell List</div>
			${$wrpExpandedHeaders}
			${$rowsExpanded}
			${$wrpNoneAvailableExpanded}
		</div>` : null;

		const isChooseAbility = this._isChooseAbility(ix);

		const $wrpChooseAbility = isChooseAbility ? this._render_$getSelChooseAbility(ix) : null;

		const $stgAbility = isChooseAbility ? $$`<div class="split-v-center">
			<div class="bold my-0 no-shrink mr-2">Ability Score</div>
			${$wrpChooseAbility}
		</div>` : null;

		if ($btnSelect) $wrpOptionsButtons.append($btnSelect);

		const $stg = $$`<div class="ve-flex-col">
			${$stgInnatePrepared}
			${$stgExpanded}
			${$stgAbility}
		</div>`.appendTo($wrpOptions);

		if (this._additionalSpellsFlat.length !== 1) {
			const hkIsActive = () => {
				$btnSelect.toggleClass("active", this._state.ixSet === ix);
				$stg.toggleVe(this._state.ixSet === ix);
			};
			this._addHookBase("ixSet", hkIsActive);
			hkIsActive();

			// Reset selections on changing group. This avoids e.g. Magic Initiate selecting some Bard spells, switching
			//   to Wizard, and still having Bard spells selected.
			const hkResetActive = (prop, value, prevValue) => {
				const prevBlock = this._additionalSpellsFlat[prevValue];
				const nxtState = Object.values(prevBlock.spells).mergeMap(it => ({[it.key]: null}));
				this._proxyAssignSimple("state", nxtState);
			};
			this._addHookBase("ixSet", hkResetActive);
		}
	}

	_getProps_chooseFrom ({groupUid}) {
		return {
			propBase: `chooseFrom_${groupUid}`,
		};
	}

	_render_$getRows (ix, spells, {isExpandedMatch}) {
		if (!spells.length) return null;

		const byLevel = {};
		spells.forEach(flat => {
			if (flat.isExpanded !== isExpandedMatch) return;

			const level = flat.requiredCasterLevel || flat.requiredLevel;
			(byLevel[level] = byLevel[level] || []).push(flat);
		});

		return Object.entries(byLevel)
			.sort(([kA], [kB]) => SortUtil.ascSort(Number(kA), Number(kB)))
			.map(([, flats]) => {
				const requiredLevel = flats[0].requiredLevel;
				const requiredCasterLevel = flats[0].requiredCasterLevel;
				const isRequiredCasterLevel = flats[0].requiredCasterLevel != null;
				const isRequiredLevel = flats[0].requiredLevel != null;

				// region Collect all choose-from groups
				const chooseFromGroups = {};
				flats = flats.filter(flat => {
					if (!flat.chooseFromGroup) return true;

					chooseFromGroups[flat.chooseFromGroup] = chooseFromGroups[flat.chooseFromGroup] || {
						from: [],
						count: flat.chooseFromCount ?? 1,
					};
					chooseFromGroups[flat.chooseFromGroup].from.push(flat);

					return false;
				});
				// endregion

				const [flatsBasic, flatsChoose] = flats.segregate(it => it.filterExpression == null);
				flatsBasic.sort((a, b) => SortUtil.ascSortLower(a.uid, b.uid));
				flatsChoose.sort((a, b) => SortUtil.ascSortLower(a.filterExpression, b.filterExpression));

				const $colSpells = $$`<div class="col-9 ve-flex-v-center ve-flex-wrap">
					<div>${Renderer.get().render(flatsBasic.map(it => `{@spell ${it.uid.toSpellCase()}}`).join(", "))}</div>
				</div>`;

				flatsChoose.forEach((flat, i) => {
					const $dispSpell = $(`<div class="ve-flex-v-center"></div>`);
					const hkChosenSpell = () => {
						$dispSpell.html(
							this._state[flat.key] != null && this._state.ixSet === ix
								? `<div>${Renderer.get().render(`{@spell ${this._state[flat.key].toLowerCase()}}`)}</div>`
								: `<div class="italic ve-muted">(select a spell)</div>`,
						);
					};
					this._addHookBase(flat.key, hkChosenSpell);
					if (this._additionalSpellsFlat.length !== 1) {
						this._addHookBase("ixSet", hkChosenSpell);
					}
					hkChosenSpell();

					const $btnFilter = $(`<button class="btn btn-default btn-xxs mr-1" title="Choose a Spell"><span class="fas fa-fw fa-search"></span></button>`)
						.click(async () => {
							const selecteds = await this._modalFilterSpells.pGetUserSelection({filterExpression: flat.filterExpression});
							if (selecteds == null || !selecteds.length) return;

							const selected = selecteds[0];

							this._state[flat.key] = `${selected.name}|${selected.values.sourceJson}`;
							this._state.pulseChoose = !this._state.pulseChoose;
						});

					if (this._additionalSpellsFlat.length !== 1) {
						const hkDisableBtnFilter = () => $btnFilter.prop("disabled", this._state.ixSet !== ix);
						this._addHookBase("ixSet", hkDisableBtnFilter);
						hkDisableBtnFilter();
					}

					if (flatsBasic.length || i) $colSpells.append(`<div class="mr-2">,</div>`);
					$$`<div class="ve-flex-v-center">${$btnFilter}${$dispSpell}</div>`.appendTo($colSpells);
				});

				Object.entries(chooseFromGroups)
					.forEach(([groupUid, group], i) => {
						const {propBase} = this._getProps_chooseFrom({groupUid});

						const meta = ComponentUiUtil.getMetaWrpMultipleChoice(
							this,
							propBase,
							{
								values: group.from.map(it => it.uid),
								fnDisplay: v => Renderer.get().render(`{@spell ${v}}`),
								count: group.count,
							},
						);

						// On selection change, pulse our main "choose" prop
						const hkPulse = () => this._state.pulseChoose = !this._state.pulseChoose;
						this._addHookBase(meta.propPulse, hkPulse);

						// If we have multiple spell sets, disable UI elements when another set is active
						if (this._additionalSpellsFlat.length !== 1) {
							const hkDisableUi = () => {
								meta.rowMetas.forEach(({$cb}) => $cb.prop("disabled", this._state.ixSet !== ix));
							};
							this._addHookBase("ixSet", hkDisableUi);
							hkDisableUi();
						}

						// Create a custom UI from the multi-select
						const $ptsInline = [];
						meta.rowMetas.forEach(({$cb, displayValue}) => {
							$ptsInline.push($$`<div class="ve-flex-v-center mr-2 no-wrap">${displayValue}${$cb.addClass("ml-1")}</div>`);
						});

						if (flatsBasic.length || flatsChoose.length || i) $colSpells.append(`<div class="mr-2">,</div>`);
						$$`<div class="ve-flex-v-center ve-flex-wrap"><i class="mr-1 ve-muted no-wrap">Choose ${group.count === 1 ? "" : `${group.count} `}from:</i>${$ptsInline}</div>`.appendTo($colSpells);
					});

				const $row = $$`<div class="py-1 ve-flex-v-center stripe-even">
					<div class="col-3 text-center">${Parser.getOrdinalForm(requiredCasterLevel || requiredLevel) || `<i class="ve-muted">Current</i>`}</div>
					${$colSpells}
				</div>`;

				if (isRequiredCasterLevel) {
					const hkLevel = () => $row.toggleVe(this._isRequiredCasterLevelInRange(requiredCasterLevel));
					this._addHookBase("spellLevelLow", hkLevel);
					this._addHookBase("spellLevelHigh", hkLevel);
					this._addHookBase("isAnyCantrips", hkLevel);
					hkLevel();
				} else if (isRequiredLevel) {
					const hkLevel = () => $row.toggleVe(this._isRequiredLevelInRange(requiredLevel));
					this._addHookBase("curLevel", hkLevel);
					this._addHookBase("targetLevel", hkLevel);
					hkLevel();
				} else {
					$row.showVe();
				}

				return $row;
			});
	}

	_render_$getSelChooseAbility (ix) {
		return ComponentUiUtil.$getSelEnum(
			this,
			"ability",
			{
				values: this._additionalSpells[ix].ability.choose,
				fnDisplay: abv => Parser.attAbvToFull(abv),
				isAllowNull: true,
			},
		);
	}

	_isRequiredLevelInRange (requiredLevel) {
		return requiredLevel > (this._state.curLevel ?? Number.MAX_SAFE_INTEGER)
			&& requiredLevel <= (this._state.targetLevel ?? Number.MIN_SAFE_INTEGER);
	}

	_isRequiredCasterLevelInRange (requiredCasterLevel) {
		// If the creature can cast cantrips, allow cantrips
		if (requiredCasterLevel === 0) return this._state.isAnyCantrips;

		return requiredCasterLevel >= (this._state.spellLevelLow ?? Number.MAX_SAFE_INTEGER) && requiredCasterLevel <= (this._state.spellLevelHigh == null ? Number.MIN_SAFE_INTEGER : this._state.spellLevelHigh);
	}

	_getFlatSpellsInRange (ixSet, {isExpandedMatch = null} = {}) {
		if (ixSet == null) ixSet = this._state.ixSet;

		return Object.values((this._additionalSpellsFlat[ixSet] || {spells: []}).spells).filter(flat => {
			if (isExpandedMatch != null) {
				if (flat.isExpanded !== isExpandedMatch) return false;
			}

			if (flat.requiredCasterLevel != null) return this._isRequiredCasterLevelInRange(flat.requiredCasterLevel);
			else if (flat.requiredLevel != null) return this._isRequiredLevelInRange(flat.requiredLevel);
			return true;
		});
	}

	_getFlatInnatePreparedSpellsInRange (ixSet) { return this._getFlatSpellsInRange(ixSet, {isExpandedMatch: false}); }
	_getFlatExpandedSpellsInRange (ixSet) { return this._getFlatSpellsInRange(ixSet, {isExpandedMatch: true}); }

	_isAnyInnatePrepared (ixSet) { return this._isAnyInnatePreparedExpanded(ixSet, {isExpandedMatch: false}); }
	_isAnyExpanded (ixSet) { return this._isAnyInnatePreparedExpanded(ixSet, {isExpandedMatch: true}); }

	_isAnyInnatePreparedExpanded (ixSet, {isExpandedMatch}) {
		if (ixSet == null) ixSet = this._state.ixSet;

		return Object.values((this._additionalSpellsFlat[ixSet] || {spells: []}).spells).some(flat => flat.isExpanded === isExpandedMatch);
	}

	_isChooseAbility (ixSet) {
		if (ixSet == null) ixSet = this._state.ixSet;
		return (this._additionalSpells[ixSet]?.ability?.choose?.length ?? 0) > 1;
	}

	isNoChoice ({curLevel, targetLevel, isStandalone} = {}) {
		return this.constructor.isNoChoice(this._additionalSpells, {additionalSpellsFlat: this._additionalSpellsFlat, curLevel, targetLevel, isStandalone});
	}

	getFormData () {
		let flatSpellsInRange = MiscUtil.copy(this._getFlatSpellsInRange());

		// region Collect all choose-from groups
		const chooseFromGroups = {};
		flatSpellsInRange.forEach(flat => {
			if (!flat.chooseFromGroup) return;

			chooseFromGroups[flat.chooseFromGroup] = chooseFromGroups[flat.chooseFromGroup] || {
				from: [],
				selectedValues: [],
				isAcceptable: false,
				count: flat.chooseFromCount ?? 1,
			};
			chooseFromGroups[flat.chooseFromGroup].from.push(flat);
		});

		Object.entries(chooseFromGroups)
			.forEach(([groupUid, groupMeta]) => {
				const {propBase} = this._getProps_chooseFrom({groupUid});

				groupMeta.isAcceptable = this._state[ComponentUiUtil.getMetaWrpMultipleChoice_getPropIsAcceptable(propBase)];

				groupMeta.selectedValues = ComponentUiUtil.getMetaWrpMultipleChoice_getSelectedValues(this, propBase, {values: groupMeta.from.map(it => it.uid)});
			});
		// endregion

		let cntNotChosen = 0;
		flatSpellsInRange = flatSpellsInRange.filter(flat => {
			if (flat.filterExpression != null) {
				const choiceMade = this._state[flat.key];
				if (!choiceMade) {
					cntNotChosen++;
					return false;
				}

				delete flat.filterExpression;
				flat.uid = this._state[flat.key];
				return true;
			}

			if (flat.chooseFromGroup != null) {
				return chooseFromGroups[flat.chooseFromGroup].selectedValues.includes(flat.uid);
			}

			return true;
		});

		let abilityAbv;
		if (this._isChooseAbility(this._state.ixSet)) {
			abilityAbv = this._state.ability;
			if (abilityAbv == null) cntNotChosen++;
		} else abilityAbv = (this._additionalSpellsFlat[this._state.ixSet] || {meta: {}}).meta.ability;

		return {
			isFormComplete: cntNotChosen === 0 && Object.values(chooseFromGroups).every(it => it.isAcceptable),
			data: flatSpellsInRange,
			abilityAbv,
		};
	}

	pGetFormData () { return this.getFormData(); }

	_getDefaultState () {
		return {
			ixSet: 0,

			curLevel: null,
			targetLevel: null,
			spellLevelLow: null,
			spellLevelHigh: null,
			isAnyCantrips: false,

			spellsAlwaysPrepared: [],
			spellsExpanded: [],
			spellsAlwaysKnown: [],

			ability: null,

			pulseChoose: false,
		};
	}
}

export {Charactermancer_AdditionalSpellsSelect};
