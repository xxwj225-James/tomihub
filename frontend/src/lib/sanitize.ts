import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
  'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'hr', 'img', 'input', 'del', 'span', 'div', 'mark', 'sub', 'sup',
  // SVG charts embedded in markdown (reports). Event handlers and scripts
  // are never allowed — DOMPurify strips them even inside svg.
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
  'polygon', 'text', 'tspan', 'defs', 'linearGradient', 'stop',
];

const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel',
  'checked', 'disabled', 'type',
  // SVG presentation attributes
  'viewBox', 'xmlns', 'preserveAspectRatio', 'width', 'height',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'fill-opacity', 'stroke-opacity', 'opacity',
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'd', 'points', 'transform', 'dx', 'dy', 'offset', 'stop-color',
  'stop-opacity', 'font-size', 'font-weight', 'font-family',
  'text-anchor', 'dominant-baseline',
];

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
