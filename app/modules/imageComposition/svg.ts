import {createHash} from 'node:crypto';
import {load as cheerioLoad} from 'cheerio';

import {IMAGE_COMPOSITION_LIMITS} from './contract.js';

const ALLOWED_SVG_TAGS = new Set([
	'svg', 'title', 'desc', 'g', 'path', 'circle', 'ellipse', 'rect', 'line',
	'polyline', 'polygon', 'text', 'tspan',
]);
const ALLOWED_SVG_ATTRIBUTES = new Set([
	'xmlns', 'viewBox', 'role', 'aria-label',
	'd', 'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width',
	'stroke-linejoin', 'stroke-linecap', 'stroke-opacity', 'opacity',
	'transform', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx',
	'ry', 'width', 'height', 'points', 'text-anchor', 'dominant-baseline',
	'font-family', 'font-size', 'font-style', 'font-weight',
]);
const FORBIDDEN_SVG_SOURCE = /(?:<!DOCTYPE|<!ENTITY|<\?xml|url\s*\()/i;
const SVG_ROOT_SOURCE = /^<svg(?:\s|>)[\s\S]*(?:<\/svg>|\/>)$/i;
const FORBIDDEN_SVG_ATTRIBUTE_VALUE =
	/(?:url\s*\(|javascript:|data:|https?:|ipfs:|ipns:)/i;
const SVG_TEXT_TAGS = new Set(['text', 'tspan']);
const FONT_WIDTH_KEYWORDS = new Set([
	'normal', 'ultra-condensed', 'extra-condensed', 'condensed',
	'semi-condensed', 'semi-expanded', 'expanded', 'extra-expanded',
	'ultra-expanded',
]);
const FONT_VARIANT_KEYWORDS = new Set([
	'normal', 'small-caps', 'all-small-caps', 'petite-caps',
	'all-petite-caps', 'unicase', 'titling-caps',
]);
const TEXT_DECORATION_KEYWORDS = new Set([
	'none', 'underline', 'overline', 'line-through',
]);
const SAFE_SPACING_VALUE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:px|em|rem|%)?$/;
const TEXT_PRESENTATION_ATTRIBUTE_VALIDATORS = new Map([
	['font-stretch', isSafeFontWidth],
	['font-width', isSafeFontWidth],
	['letter-spacing', isSafeSpacing],
	['word-spacing', isSafeSpacing],
	['font-variant', isSafeFontVariant],
	['text-decoration', isSafeTextDecoration],
]);

export interface ValidatedImageCompositionStickerSvg {
	mimeType: 'image/svg+xml';
	svg: string;
	svgHash: string;
}

export function validateAndNormalizeImageCompositionStickerSvg(value: unknown): ValidatedImageCompositionStickerSvg {
	if (typeof value !== 'string') {
		throw new Error('composition_invalid');
	}
	const svg = value.trim();
	const bytes = Buffer.byteLength(svg, 'utf8');
	if (!svg || bytes > IMAGE_COMPOSITION_LIMITS.maxStickerSvgBytes
		|| FORBIDDEN_SVG_SOURCE.test(svg) || !SVG_ROOT_SOURCE.test(svg)) {
		throw new Error('composition_invalid');
	}

	let $;
	try {
		$ = cheerioLoad(svg, {xmlMode: true, decodeEntities: false});
	} catch (_error) {
		throw new Error('composition_invalid');
	}
	const rootChildren = $.root().children().toArray();
	if (rootChildren.length !== 1 || rootChildren[0].tagName !== 'svg') {
		throw new Error('composition_invalid');
	}

	let valid = true;
	$(' *').addBack('svg').each((_index, element: any) => {
		if (!valid || element.type !== 'tag' || !ALLOWED_SVG_TAGS.has(element.tagName)) {
			valid = false;
			return;
		}
		for (const [attributeName, attributeValue] of Object.entries(element.attribs || {})) {
			if (!isAllowedSvgAttribute(
				element.tagName,
				attributeName,
				attributeValue,
			)) {
				valid = false;
				return;
			}
		}
	});
	const root = rootChildren[0] as any;
	if (!valid || root.attribs?.xmlns !== 'http://www.w3.org/2000/svg'
		|| !isSafeViewBox(root.attribs?.viewBox)) {
		throw new Error('composition_invalid');
	}

	return {
		mimeType: 'image/svg+xml',
		svg,
		svgHash: getImageCompositionStickerSvgHash(svg),
	};
}

export function getImageCompositionStickerSvgHash(svg: string) {
	return `sha256:${createHash('sha256').update(svg, 'utf8').digest('hex')}`;
}

function isAllowedSvgAttribute(
	tagName: string,
	attributeName: string,
	attributeValue: unknown,
) {
	if (/^on/i.test(attributeName)) {
		return false;
	}
	if (attributeName !== 'xmlns'
		&& FORBIDDEN_SVG_ATTRIBUTE_VALUE.test(String(attributeValue))) {
		return false;
	}
	if (ALLOWED_SVG_ATTRIBUTES.has(attributeName)) {
		return true;
	}
	const textAttributeValidator =
		TEXT_PRESENTATION_ATTRIBUTE_VALIDATORS.get(attributeName);
	return SVG_TEXT_TAGS.has(tagName)
		&& Boolean(textAttributeValidator?.(attributeValue));
}

function isSafeFontWidth(value: unknown) {
	if (typeof value !== 'string') {
		return false;
	}
	if (FONT_WIDTH_KEYWORDS.has(value)) {
		return true;
	}
	const percentage = /^(\d+(?:\.\d+)?)%$/.exec(value);
	if (!percentage) {
		return false;
	}
	const number = Number(percentage[1]);
	return number >= 50 && number <= 200;
}

function isSafeSpacing(value: unknown) {
	if (value === 'normal') {
		return true;
	}
	if (typeof value !== 'string' || !SAFE_SPACING_VALUE.test(value)) {
		return false;
	}
	const number = Number.parseFloat(value);
	return Number.isFinite(number) && Math.abs(number) <= 10_000;
}

function isSafeFontVariant(value: unknown) {
	return typeof value === 'string' && FONT_VARIANT_KEYWORDS.has(value);
}

function isSafeTextDecoration(value: unknown) {
	if (typeof value !== 'string') {
		return false;
	}
	const keywords = value.trim().split(/\s+/);
	if (!keywords.length || keywords.length > 3) {
		return false;
	}
	if (keywords.includes('none')) {
		return keywords.length === 1;
	}
	return new Set(keywords).size === keywords.length
		&& keywords.every(keyword => TEXT_DECORATION_KEYWORDS.has(keyword));
}

function isSafeViewBox(value: unknown) {
	if (typeof value !== 'string') return false;
	const numbers = value.trim().split(/[\s,]+/).map(Number);
	return numbers.length === 4
		&& numbers.every(Number.isFinite)
		&& numbers[2] > 0
		&& numbers[3] > 0
		&& numbers.every(number => Math.abs(number) <= 1_000_000);
}
