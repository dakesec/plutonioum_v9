import {DataConverterActor} from "./DataConverterActor.js";
import {SharedConsts} from "../shared/SharedConsts.js";
import {DataConverter} from "./DataConverter.js";
import {Vetools} from "./Vetools.js";

class DataConverterObject extends DataConverter {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryObject",
		fnLoadJson: Vetools.pGetObjectSideData.bind(Vetools),
		propJson: "object",
	};

	static _IMG_FALLBACK = `modules/${SharedConsts.MODULE_NAME}/media/icon/mailed-fist.svg`;

	static async pGetParsedAction (obj, action, monOpts) {
		const {
			damageTuples,
			formula,
			offensiveAbility,
			isAttack,
			isRecharge,
			rangeShort,
			rangeLong,
			actionType,
			isProficient,
			attackBonus,
		} = DataConverterActor.getParsedActionEntryData(obj, action, monOpts, {mode: "object"});

		const img = await this._pGetSaveImagePath({...obj, _isAttack: isAttack});

		const propChild = "objectActionEntries";

		return {
			damageTuples,
			formula,
			offensiveAbility,
			isAttack,
			isRecharge,
			rangeShort,
			rangeLong,
			actionType,
			isProficient,
			attackBonus,
			foundryFlags: {
				[SharedConsts.MODULE_NAME_FAKE]: {
					page: propChild,
					source: action.source || obj.source,
					hash: UrlUtil.URL_TO_HASH_BUILDER[propChild]({
						source: obj.source,
						...action,
						objectName: obj.name,
						objectSource: obj.source,
					}),
				},
			},
			_foundryData: action._foundryData,
			_foundryFlags: action._foundryFlags,
			img,
		};
	}

	static _getImgFallback (obj) {
		if (obj._isAttack) return `modules/${SharedConsts.MODULE_NAME}/media/icon/crossed-swords.svg`;
	}
}

export {DataConverterObject};
