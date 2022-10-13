class Consts {
	static RUN_TIME = `${Date.now()}`;
	static FLAG_IFRAME_URL = "iframe_url";

	static TERMS_COUNT = [
		{tokens: ["once"], count: 1},
		{tokens: ["twice"], count: 2},
		{tokens: ["thrice"], count: 3},
		{tokens: ["three", " ", "times"], count: 3},
		{tokens: ["four", " ", "times"], count: 4},
	];

	static Z_INDEX_MAX_FOUNDRY = 9999;

	static ACTOR_TEMP_NAME = "Importing...";

	static CHAR_MAX_LEVEL = 20;
}

export {Consts};
