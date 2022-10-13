import {SharedConsts} from "../shared/SharedConsts.js";
import {LGT} from "./Util.js";

/**
 * @deprecated In favor of using `libWrapper`
 */
class UtilPatch {
	// region methods
	/**
	 * @param obj
	 * @param methodName
	 * @param [opts]
	 * @param [opts.isBind]
	 */
	static cacheMethod (obj, methodName, opts) {
		opts = opts || {};

		const existing = UtilPatch.getCachedMethod(obj, methodName);
		if (existing != null) return existing;

		const toCache = opts.isBind ? obj[methodName].bind(obj) : obj[methodName];

		// Expose the original method
		obj[`_plutoniumCache${methodName}`] = toCache;

		if (!UtilPatch._CACHE_METHODS.has(obj)) UtilPatch._CACHE_METHODS.set(obj, {});

		const store = UtilPatch._CACHE_METHODS.get(obj);
		store[methodName] = toCache;

		return toCache;
	}

	static getCachedMethod (obj, methodName) {
		if (!UtilPatch._CACHE_METHODS.has(obj)) return null;
		const store = UtilPatch._CACHE_METHODS.get(obj);
		return store[methodName] || null;
	}

	static restoreCachedMethod (obj, methodName) {
		const method = UtilPatch.getCachedMethod(obj, methodName);
		if (!method) return;
		obj[methodName] = method;
	}
	// endregion

	// region getters
	/**
	 * @param obj
	 * @param getterName
	 * @param [opts]
	 * @param [opts.isBind]
	 */
	static cacheGetter (obj, getterName, opts) {
		opts = opts || {};

		const existing = UtilPatch.getCachedMethod(obj, getterName);
		if (existing != null) return;

		const getterMeta = this._getGetterMeta(obj, getterName);
		getterMeta.fnGet = opts.isBind ? getterMeta.fnGet.bind(getterMeta.obj) : getterMeta.fnGet;

		// Expose the original method for other mods/etc to use
		Object.defineProperty(
			getterMeta.obj,
			`_plutoniumCache${getterName}`,
			{
				configurable: true,
				get: getterMeta.fnGet,
			},
		);

		if (!UtilPatch._CACHE_METHODS.has(obj)) UtilPatch._CACHE_METHODS.set(obj, {});

		const store = UtilPatch._CACHE_METHODS.get(obj);
		store[getterName] = getterMeta;
	}

	static _getGetterMeta (obj, getterName) {
		const ownProp = Object.getOwnPropertyDescriptor(obj, getterName);
		if (ownProp && ownProp.get) {
			return {
				fnGet: ownProp.get,
				obj,
			};
		}

		while (Object.getPrototypeOf(obj) !== null) {
			obj = Object.getPrototypeOf(obj);
			const parentProp = Object.getOwnPropertyDescriptor(obj, getterName);
			if (parentProp && parentProp.get) {
				return {
					fnGet: parentProp.get,
					obj,
				};
			}
		}

		throw new Error(`Could not find getter "${getterName}" on object`);
	}

	static getCachedGetterMeta (obj, getterName) {
		const getterMeta = UtilPatch.getCachedMethod(obj, getterName);
		if (getterMeta) return getterMeta;

		while (Object.getPrototypeOf(obj) !== null) {
			obj = Object.getPrototypeOf(obj);
			const getterMeta = UtilPatch.getCachedMethod(obj, getterName);
			if (getterMeta) return getterMeta;
		}
	}

	static restoreCachedGetter (obj, getterName) {
		const getterMeta = UtilPatch.getCachedGetterMeta(obj, getterName);
		if (!getterMeta) return;
		Object.defineProperty(
			getterMeta.obj,
			getterName,
			{
				configurable: true,
				get: getterMeta.fnGet,
			},
		);
	}
	// endregion
}
UtilPatch._CACHE_METHODS = new Map();
UtilPatch._CACHE_GETTERS = new Map();

class UtilPatcher {
	/** Search for the exact text node, to avoid breaking compatibility with e.g. Tidy UI */
	static findPlutoniumTextNodes (ele) {
		const stack = [];
		this._findPlutoniumTextNodes(ele, {stack});
		return stack;
	}

	static _findPlutoniumTextNodes (ele, {stack}) {
		if (!ele) return;

		if (ele.nodeName === "#text") {
			const txt = (ele.data || "").trim();
			if (txt.startsWith(SharedConsts.MODULE_TITLE)) stack.push(ele);
		}

		for (let i = 0; i < ele.childNodes.length; ++i) {
			const node = ele.childNodes[i];
			this._findPlutoniumTextNodes(node, {stack});
		}
	}
}

export {UtilPatch, UtilPatcher};
