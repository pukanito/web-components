/**
 * Basic functionality of a custom HTML element.
 */
// noinspection JSUnusedGlobalSymbols — placeholder definition.
export class CustomHTMLElement extends HTMLElement {
  /**
   * Custom element default methods.
   */
  connectedCallback(): void {}
  disconnectedCallback(): void {}
  adoptedCallback(): void {}
  attributeChangedCallback(
    _attributeName: string,
    _oldValue: any,
    _newValue: any
  ): void {}

  /**
   * Set the specified attribute to the specified value, but only if the attribute is not already set.
   *
   * @param name attribute name to set.
   * @param value attribute value.
   */
  setAttributeIfUndefined(name: any, value: any) {
    if (!this.getAttribute(name)) {
      this.setAttribute(name, value);
    }
  }
}
