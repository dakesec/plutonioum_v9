import {Vetools} from "./Vetools.js";
import {DataConverter} from "./DataConverter.js";

class DataConverterTrap extends DataConverter {
	static _SIDE_LOAD_OPTS = {
		propBrew: "foundryTrap",
		fnLoadJson: Vetools.pGetTrapHazardSideData.bind(Vetools),
		propJson: "trap",
	};
}

export {DataConverterTrap};
