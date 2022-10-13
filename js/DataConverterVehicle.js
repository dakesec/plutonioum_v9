import {DataConverter} from "./DataConverter.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {Vetools} from "./Vetools.js";
import {Config} from "./Config.js";
import {UtilApplications} from "./UtilApplications.js";
import {UtilActiveEffects} from "./UtilActiveEffects.js";

class DataConverterVehicle extends DataConverter {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryVehicle",
		fnLoadJson: Vetools.pGetVehicleSideData.bind(Vetools),
		propJson: "vehicle",
	};

	static _SIDE_LOAD_OPTS_WEAPON = {
		propBrew: "foundryVehicleWeapon",
		fnLoadJson: Vetools.pGetVehicleSideData.bind(Vetools),
		propJson: "vehicleWeapon",
		propsMatch: ["vehicleSource", "vehicleName", "source", "name"],
	};

	// region Movement
	static getShipMovement (veh) {
		switch (veh.vehicleType) {
			case "SHIP": return this._getShipMovement_ship(veh);
			case "INFWAR": return this._getShipMovement_infwar(veh);
			case "SPELLJAMMER": return this._getShipMovement_spelljammer(veh);
			default: throw new Error(`Unhandled vehicle type "${veh.vehicleType}"`);
		}
	}

	static _getShipMovement_ship (veh) {
		const out = {};

		(veh.movement || []).forEach(move => {
			this._doPopulateMovementToSpeedMap(move, "locomotion", out);
			this._doPopulateMovementToSpeedMap(move, "speed", out);
		});

		if (!Object.keys(out).length && veh.pace && typeof veh.pace === "number" && veh.terrain?.length) {
			veh.terrain.forEach(ter => {
				const speedProp = this._getMovementTypeFromTerrain(ter);
				out[speedProp] = Config.getMetricNumberDistance({configGroup: "importVehicle", originalUnit: UNT_MILES, originalValue: veh.pace});
			});
			out.units = Config.getMetricUnitDistance({configGroup: "importVehicle", originalUnit: "mi"});
		}

		// Replace the default "30 foot walking speed" if we have no walking speed
		if (!out.walk) out.walk = 0;

		return out;
	}

	static _getMovementTypeFromTerrain (ter) {
		switch (ter) {
			case "air": return "fly";
			case "land": return "walk";
			case "sea": return "swim";
			case "space": return "fly";
			default: throw new Error(`Unhandled terrain type "${ter}"`);
		}
	}

	static _doPopulateMovementToSpeedMap (move, prop, out) {
		if (!move[prop]) return;

		move[prop].forEach(spd => {
			if (!spd.entries || !spd.entries.length) return;

			const speedProp = this._getSpeedTypeFromMovementMode(spd.mode);

			// If the speed prop comes back as "null", we should try to parse the string manually
			if (speedProp == null) {
				UtilDataConverter.WALKER_READONLY_GENERIC.walk(
					spd.entries,
					{
						string: (str) => {
							str.split(",").map(it => it.trim()).filter(Boolean).forEach(pt => {
								pt.replace(/^(?:(burrow|climb|swim|fly) )?(\d+) ft\./g, (...m) => {
									const speedType = m[1].toLowerCase().trim();
									const speed = Config.getMetricNumberDistance({configGroup: "importVehicle", originalUnit: UNT_FEET, originalValue: Number(m[2])});
									out[speedType] = Math.max(speed, out[speedType] || 0);
								});
							});

							if (str.toLowerCase().includes("(hover)")) out.hover = true;
						},
					},
				);

				return;
			}

			UtilDataConverter.WALKER_READONLY_GENERIC.walk(
				spd.entries,
				{
					string: (str) => {
						str.replace(/speed (\d+) ft\./g, (...m) => {
							const speed = Config.getMetricNumberDistance({configGroup: "importVehicle", originalUnit: UNT_FEET, originalValue: Number(m[1])});
							out[speedProp] = Math.max(speed, out[speedProp] || 0);
						});

						if (str.toLowerCase().includes("(hover)")) out.hover = true;
					},
				},
			);
		});
	}

	static _getSpeedTypeFromMovementMode (mode) {
		switch (mode) {
			case "air": return "fly";
			case "water": return "swim";
			case "magical": return null;
			default: throw new Error(`Unhandled locomotion mode "${mode}"`);
		}
	}

	static _getShipMovement_infwar (veh) {
		return this._getShipMovement_fromStandardSpeed(veh);
	}

	static _getShipMovement_spelljammer (veh) {
		return this._getShipMovement_fromStandardSpeed(veh);
	}

	static _getShipMovement_fromStandardSpeed (veh) {
		return this.getMovement(veh.speed, {configGroup: "importVehicle"});
	}
	// endregion

	static async pGetShipEquipmentItem (veh, equi, prop) {
		let description = await DataConverter.pGetEntryDescription(equi);

		if (prop === "movement") {
			if (equi.speed) {
				const parts = equi.speed
					.map(it => Renderer.vehicle.ship.getSpeedEntries(it))
					.map(ents => `<div>${Renderer.get().setFirstSection(true).render(ents)}</div>`);
				description += parts.join("");
			}

			if (equi.locomotion) {
				const parts = equi.locomotion
					.map(loc => Renderer.vehicle.ship.getLocomotionEntries(loc))
					.map(ents => `<div>${Renderer.get().setFirstSection(true).render(ents)}</div>`);
				description += parts.join("");
			}
		}

		const out = {
			name: equi.name,
			type: "equipment",
			data: {
				description: {value: description, chat: "", unidentified: ""},
				source: UtilDataConverter.getSourceWithPagePart(veh),
				quantity: 1,
				weight: 0,
				price: 0,
				attuned: false,
				equipped: true,
				rarity: "",
				identified: true,
				activation: {type: "", cost: 0, condition: ""},
				duration: {value: null, units: ""},
				target: {value: null, width: null, units: "", type: ""},
				range: {value: null, long: null, units: ""},
				uses: {value: 0, max: 0, per: null},
				consume: {type: "", target: null, amount: null},
				ability: null,
				actionType: "",
				attackBonus: null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				damage: {parts: [], versatile: ""},
				formula: "",
				save: {ability: "", dc: null, scaling: "spell"},
				armor: {value: equi.ac || 0, type: "vehicle", dex: null},
				hp: {value: equi.hp || 0, max: equi.hp || 0, dt: equi.dt, conditions: equi.hpNote || ""},
				speed: {value: null, conditions: ""},
				strength: 0,
				stealth: false,
				proficient: true,
			},
			flags: {},
			img: await Vetools.pOptionallySaveImageToServerAndGetUrl(
				`modules/${SharedConsts.MODULE_NAME}/media/icon/ship-wheel.svg`,
			),
		};

		// If we have movement info, use the first one available to set our speed. We _could_ instead opt to map each
		//   piece of movement info to its own sheet item, but this would be more confusing than helpful (e.g. showing
		//   multiple entries for "Sails" on the sheet). Just present the information textually, and let the user figure
		//   it out.
		// FIXME(Future) as of 2021-11-03, these do not support units
		if (prop === "movement") {
			if (equi.speed) {
				const metas = this._getSpeedMetas(equi);
				if (metas.length) {
					const primaryMeta = metas[0];
					out.data.speed.value = primaryMeta.speed;
					out.data.speed.conditions = primaryMeta.condition;
				}
			}

			if (equi.locomotion) {
				const metas = this._getLocomotionMetas(equi);
				if (metas.length) {
					const primaryMeta = metas[0];
					out.data.speed.value = primaryMeta.speed;
					out.data.speed.conditions = primaryMeta.condition;
				}
			}
		}

		return out;
	}

	static _getSpeedMetas (equi) {
		if (!equi.speed || !equi.speed.length) return [];

		return equi.speed
			.map(spd => {
				if (!spd.entries || !spd.entries.length || typeof spd.entries[0] !== "string") return null;

				const parts = spd.entries[0].split(";").map(it => it.trim()).filter(Boolean);
				return parts.map(it => {
					const mSpeed = /^((?:fly|swim|burrow|climb) )?(\d+)\s*ft\.(.*?)$/.exec(it);
					if (!mSpeed) return null;
					const out = {speed: Config.getMetricNumberDistance({configGroup: "importVehicle", originalUnit: UNT_FEET, originalValue: Number(mSpeed[2])})};
					if (mSpeed[3]) {
						const conditionClean = mSpeed[3].trim().replace(/^,\s*/, "");
						if (conditionClean) out.condition = conditionClean;
					}
					return out;
				});
			})
			.filter(Boolean)
			.flat();
	}

	static _getLocomotionMetas (equi) {
		if (!equi.locomotion || !equi.locomotion.length) return [];

		return equi.locomotion
			.map(loc => {
				if (!loc.entries || !loc.entries.length || typeof loc.entries[0] !== "string") return null;

				const mSpeed = /^(.*?), speed (\d+)\s*ft\.(.*?)$/i.exec(loc.entries[0]);
				if (!mSpeed) return null;

				let [_, subMode, baseSpeed, conditionOrOtherSpeeds] = mSpeed;
				subMode = subMode.trim(); // This appears to be a repetition of the name; ignore it
				baseSpeed = baseSpeed.trim();
				conditionOrOtherSpeeds = conditionOrOtherSpeeds.trim();

				const otherPartsRaw = conditionOrOtherSpeeds.split(";").map(it => it.trim()).filter(Boolean);
				const [conditionPart, ...otherParts] = conditionOrOtherSpeeds.includes(";")
					? ["", ...otherPartsRaw]
					: otherPartsRaw;

				const outPrimary = {
					speed: Config.getMetricNumberDistance({configGroup: "importVehicle", originalUnit: UNT_FEET, originalValue: Number(baseSpeed)}),
				};
				if (conditionPart) outPrimary.condition = conditionPart;

				const outSecondaries = [];
				otherParts.forEach(part => {
					const mSpeed = /^(\d+)\s*ft\.(.*?)$/.exec(part);
					if (!mSpeed) return;
					outSecondaries.push({
						speed: Config.getMetricNumberDistance({configGroup: "importVehicle", originalUnit: UNT_FEET, originalValue: Number(mSpeed[1])}),
						condition: mSpeed[2],
					});
				});

				return [outPrimary, ...outSecondaries];
			})
			.filter(Boolean)
			.flat();
	}

	static _getFauxVehicleWeapon (veh, weap) {
		return {
			source: veh.source,
			backgroundName: veh.name,
			backgroundSource: veh.source,
			srd: veh.srd,
			...MiscUtil.copy(weap),
		};
	}

	static async pGetShipWeaponItems (veh, weap, opts) {
		opts = opts || {};
		const {fvttType = null} = opts;

		if (weap.action?.length) return this._pGetShipWeaponParentChildItems(veh, weap, opts);

		const description = await DataConverter.pGetEntryDescription(weap);

		const state = new this._PassiveEntryParseState(
			{
				entry: weap,
				name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(weap, {displayName: opts.displayName, isActorItem: true})),
			},
			opts,
		);
		await state.pInit();

		const {
			damageTupleMetas,
			isAttack,
			isRecharge,
			rangeShort,
			rangeLong,
			actionType,
			attackBonus,
		} = DataConverter.getParsedWeaponEntryData(veh, weap);

		if (isAttack) {
			if (state.activationType === undefined) state.activationType = "action";
			if (state.activationCost === undefined) state.activationCost = 1;
		}

		const {damageParts, formula} = DataConverter.getDamagePartsAndOtherFormula(damageTupleMetas);

		const img = await Vetools.pOptionallySaveImageToServerAndGetUrl(
			`modules/${SharedConsts.MODULE_NAME}/media/icon/pirate-cannon.svg`,
		);

		const fauxEnt = this._getFauxVehicleWeapon(veh, weap);

		const additionalData = await this._pGetDataSideLoaded(fauxEnt, {propOpts: "_SIDE_LOAD_OPTS_WEAPON"});
		const additionalFlags = await this._pGetFlagsSideLoaded(fauxEnt, {propOpts: "_SIDE_LOAD_OPTS_WEAPON"});

		const effectsSideTuples = await this._pGetEffectsSideLoadedTuples({ent: fauxEnt, img}, {propOpts: "_SIDE_LOAD_OPTS_WEAPON"});
		effectsSideTuples.forEach(({effect, effectRaw}) => DataConverter.mutEffectDisabledTransfer(effect, "importVehicle", UtilActiveEffects.getDisabledTransferHintsSideData(effectRaw)));

		const out = {
			name: weap.name,
			type: fvttType || (isRecharge ? "feat" : "weapon"),
			data: {
				description: {value: description, chat: "", unidentified: ""},
				source: UtilDataConverter.getSourceWithPagePart(veh),
				quantity: weap.count || 1,
				weight: 0,
				price: 0,
				attuned: false,
				equipped: true,
				rarity: "",
				identified: true,
				activation: {
					type: state.activationType,
					cost: state.activationCost,
					condition: state.activationCondition,
				},
				duration: {value: null, units: ""},
				target: {value: null, width: null, units: "", type: ""},
				range: {value: rangeShort || 0, long: rangeLong || 0, units: "ft"},
				uses: {value: 0, max: 0, per: null},
				consume: {type: "", target: null, amount: null},
				ability: "",
				actionType: actionType || "other",
				attackBonus: attackBonus || null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				damage: {parts: damageParts || [], versatile: ""},
				formula,
				save: {ability: "", dc: null, scaling: "spell"},
				armor: {value: weap.ac || 0},
				hp: {value: weap.hp || 0, max: weap.hp || 0, dt: weap.dt, conditions: ""},
				weaponType: "siege",
				properties: {},
				proficient: true,

				...additionalData,
			},
			flags: {
				...additionalFlags,
			},
			img,
			effects: effectsSideTuples.map(it => it.effect),
		};

		return [out];
	}

	static async _pGetShipWeaponParentChildItems (veh, weap, opts) {
		let actionCount;
		if (weap.entries) {
			const walker = MiscUtil.getWalker({
				keyBlocklist: MiscUtil.GENERIC_WALKER_ENTRIES_KEY_BLOCKLIST,
				isBreakOnReturn: true,
				isNoModification: true,
			});
			walker.walk(
				weap.entries,
				{
					string: (str) => {
						// E.g.
						// "It takes 1 action to load the ballista, 1 action to aim it, and 1 action to fire it."
						// "It takes 2 actions to load a mangonel, 2 actions to aim it, and 1 action to fire it."
						str.replace(/\b(?<actions>\d+) action(s)?\b/g, (...m) => {
							const numActions = Number(m.last().actions);
							if (actionCount == null) actionCount = numActions;
							else actionCount += numActions;
						});

						if (actionCount != null) return true;
					},
				},
			);
		}

		const subOpts = {fvttType: "feat"};
		if (actionCount) {
			subOpts.activationType = "action";
			subOpts.activationCost = actionCount;
		}
		const subs = (await weap.action.pSerialAwaitMap(act => this.pGetShipWeaponItems(veh, act, subOpts)))
			.flat();

		const price = (weap.costs || [])
			.filter(it => it.cost && !isNaN(it.cost))
			.sort((a, b) => SortUtil.ascSort(b.cost, a.cost))
			.map(it => it.cost / 100)[0];

		let description = await DataConverter.pGetEntryDescription(weap);
		description = Renderer.vehicle.spelljammer.getSectionHpCostPart_(Renderer.get(), weap) + description;

		// TODO(v10) link parent item -> child items
		const parent = {
			name: weap.name,
			type: "equipment",
			data: {
				description: {value: description, chat: "", unidentified: ""},
				source: UtilDataConverter.getSourceWithPagePart(veh),
				quantity: weap.count,
				weight: 0,
				price: price,
				attuned: false,
				equipped: true,
				rarity: "",
				identified: true,
				activation: {type: "", cost: 0, condition: ""},
				duration: {value: null, units: ""},
				target: {value: null, width: null, units: "", type: ""},
				range: {value: null, long: null, units: ""},
				uses: {value: 0, max: 0, per: null},
				consume: {type: "", target: null, amount: null},
				ability: null,
				actionType: "",
				attackBonus: null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				damage: {parts: [], versatile: ""},
				formula: "",
				save: {ability: "", dc: null, scaling: "spell"},
				armor: {value: weap.ac || 0, type: "vehicle", dex: null},
				hp: {value: weap.hp || 0, max: weap.hp || 0, dt: weap.dt},
				speed: {value: null, conditions: ""},
				strength: 0,
				stealth: false,
				proficient: true,
			},
			flags: {},
			img: await Vetools.pOptionallySaveImageToServerAndGetUrl(
				`modules/${SharedConsts.MODULE_NAME}/media/icon/pirate-cannon.svg`,
			),
		};

		return [parent, ...subs];
	}

	static async pGetShipOtherItem (veh, ent) {
		const description = await DataConverter.pGetEntryDescription(ent);

		if (/^Actions?$/i.test(ent.name || "")) {
			return {
				name: ent.name,
				type: "feat",
				data: {
					description: {value: description, chat: "", unidentified: ""},
					source: UtilDataConverter.getSourceWithPagePart(veh),
					activation: {type: "crew", cost: 1, condition: ""},
					duration: {value: null, units: ""},
					target: {value: null, width: null, units: "", type: ""},
					range: {value: null, long: null, units: ""},
					uses: {value: 0, max: 0, per: ""},
					consume: {type: "", target: "", amount: null},
					ability: null,
					actionType: "",
					attackBonus: null,
					chatFlavor: "",
					critical: {threshold: null, damage: ""},
					damage: {parts: [], versatile: ""},
					formula: "",
					save: {ability: "", dc: null, scaling: "spell"},
					requirements: "",
					recharge: {value: null, charged: false},
					cover: null,
				},
				flags: {},
				img: await Vetools.pOptionallySaveImageToServerAndGetUrl(
					`modules/${SharedConsts.MODULE_NAME}/media/icon/ship-wheel.svg`,
				),
			};
		}

		return {
			name: ent.name,
			type: "feat",
			data: {
				description: {value: description, chat: "", unidentified: ""},
				source: UtilDataConverter.getSourceWithPagePart(veh),
				activation: {type: "", cost: 0, condition: ""},
				duration: {value: null, units: ""},
				target: {value: null, width: null, units: "", type: ""},
				range: {value: null, long: null, units: ""},
				uses: {value: 0, max: 0, per: null},
				consume: {type: "", target: null, amount: null},
				ability: null,
				actionType: "",
				attackBonus: null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				damage: {parts: [], versatile: ""},
				formula: "",
				save: {ability: "", dc: null, scaling: "spell"},
				requirements: "",
				recharge: {value: null, charged: false},
			},
			flags: {},
			img: await Vetools.pOptionallySaveImageToServerAndGetUrl(
				`modules/${SharedConsts.MODULE_NAME}/media/icon/ship-wheel.svg`,
			),
		};
	}

	static async pGetShipActionItems (veh, actionEnts) {
		const ixActionList = actionEnts.findIndex(it => it.type === "list" && it.items.every(it => it.type === "item"));

		const templateOut = {
			name: "",
			type: "feat",
			data: {
				description: {value: "", chat: "", unidentified: ""},
				source: UtilDataConverter.getSourceWithPagePart(veh),
				activation: {type: "crew", cost: 1, condition: ""},
				duration: {value: null, units: ""},
				target: {value: null, width: null, units: "", type: ""},
				range: {value: null, long: null, units: ""},
				uses: {value: 0, max: 0, per: ""},
				consume: {type: "", target: "", amount: null},
				ability: null,
				actionType: "",
				attackBonus: null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				damage: {parts: [], versatile: ""},
				formula: "",
				save: {ability: "", dc: null, scaling: "spell"},
				requirements: "",
				recharge: {value: null, charged: false},
				cover: null,
			},
			flags: {},
			img: await Vetools.pOptionallySaveImageToServerAndGetUrl(
				`modules/${SharedConsts.MODULE_NAME}/media/icon/ship-wheel.svg`,
			),
		};

		if (!~ixActionList) {
			templateOut.name = "Actions";
			templateOut.data.description.value = await DataConverter.pGetEntryDescription({entries: actionEnts});
			return [templateOut];
		}

		actionEnts = MiscUtil.copy(actionEnts);
		const actionList = actionEnts[ixActionList];
		actionEnts.splice(ixActionList, 1);

		return actionList.items.pSerialAwaitMap(async li => {
			const subName = li.name.replace(/\.$/i, "");

			const fauxEntries = MiscUtil.copy(actionEnts);
			if (typeof fauxEntries[0] === "string") fauxEntries[0] = fauxEntries[0].replace(/, choosing from the options below[.:]/ig, ".");
			fauxEntries.unshift({type: "entries", name: subName, entries: li.entries || [li.entry]});

			const description = await DataConverter.pGetEntryDescription({entries: fauxEntries});

			const subOut = MiscUtil.copy(templateOut);
			subOut.name = subName;
			subOut.data.description.value = description;
			return subOut;
		});
	}

	static async pGetInfWarActionItem (veh, action) {
		const description = await DataConverter.pGetEntryDescription(action);

		const {
			damageTupleMetas,
			isAttack,
			isRecharge,
			rangeShort,
			rangeLong,
			actionType,
			attackBonus,
		} = DataConverter.getParsedWeaponEntryData(veh, action);

		const {damageParts, formula} = DataConverter.getDamagePartsAndOtherFormula(damageTupleMetas);

		let coverType = 0;
		(action.name || "").replace(/(Grants Half Cover|Grants Three-Quarters Cover|Grants Total Cover)/ig, (...m) => {
			const low = m[1].toLowerCase().trim();
			switch (low) {
				case "grants half cover": coverType = 0.5; break;
				case "grants three-quarters cover": coverType = 0.75; break;
				case "grants total cover": coverType = 1; break;
				default: throw new Error(`Unknown cover type ""${low}`);
			}
		});

		return {
			name: action.name,
			type: "feat",
			data: {
				description: {value: description, chat: "", unidentified: ""},
				source: UtilDataConverter.getSourceWithPagePart(veh),
				activation: {type: "crew", cost: 1, condition: ""},
				duration: {value: null, units: ""},
				target: {value: null, width: null, units: "", type: ""},
				range: {value: rangeShort, long: rangeLong, units: "ft"},
				uses: {value: 0, max: 0, per: ""},
				consume: {type: "", target: "", amount: null},
				ability: "",
				actionType: actionType || "other",
				attackBonus: attackBonus || null,
				chatFlavor: "",
				critical: {threshold: null, damage: ""},
				damage: {parts: damageParts || [], versatile: ""},
				formula,
				save: {ability: "", dc: null, scaling: "spell"},
				requirements: "",
				recharge: {value: null, charged: false},
				cover: coverType,
			},
			flags: {},
			img: await Vetools.pOptionallySaveImageToServerAndGetUrl(
				`modules/${SharedConsts.MODULE_NAME}/media/icon/gears.svg`,
			),
		};
	}
}

export {DataConverterVehicle};
