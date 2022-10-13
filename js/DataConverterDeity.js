import {UtilApplications} from "./UtilApplications.js";
import {Config} from "./Config.js";
import {UtilDataConverter} from "./UtilDataConverter.js";
import {DataConverter} from "./DataConverter.js";

class DataConverterDeity extends DataConverter {
	/**
	 * @param deity
	 * @param [opts] Options object.
	 * @param [opts.isAddPermission]
	 * @param [opts.defaultPermission]
	 */
	static async pGetDeityJournal (deity, opts) {
		opts = opts || {};

		const content = await UtilDataConverter.pGetWithDescriptionPlugins(() => {
			return `<div>
				${Renderer.deity.getOrderedParts(deity, `<p>`, `</p>`)}
				${deity.entries ? `<div>${Renderer.get().setFirstSection(true).render({entries: deity.entries}, 1)}</div>` : ""}
			</div>`;
		});

		const img = await this._pGetSaveImagePath(deity);

		const out = {
			name: UtilApplications.getCleanEntityName(UtilDataConverter.getNameWithSourcePart(deity, {displayName: deity.title ? `${deity.name}, ${deity.title.toTitleCase()}` : null})),
			permission: {default: 0},
			entryTime: Date.now(),
			content,
			img,
		};

		if (opts.defaultPermission != null) out.permission = {default: opts.defaultPermission};
		else if (opts.isAddPermission) out.permission = {default: Config.get("importDeity", "permissions")};

		return out;
	}

	static async _pGetImagePath_ (deity) {
		return deity.symbolImg
			? Renderer.utils.getMediaUrl(deity.symbolImg, "href", "img")
			: null;
	}
}

export {DataConverterDeity};
