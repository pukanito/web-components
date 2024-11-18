import { Constructor } from './mixin-constructor';
import { CustomHTMLElement } from './custom-html-element';

/**
 * Mixin to apply a button role to a CustomHTMLElement.
 */
export function HTMLRoleButtonElement<T extends Constructor<CustomHTMLElement>>(Base: T) {
  return class HTMLRoleButtonElement extends Base {
    override connectedCallback() {
      super.connectedCallback();
      // Make it a button.
      this.setAttributeIfUndefined('role', 'button');
      this.setAttributeIfUndefined('tabindex', '0');
      this.addEventListener('keydown', this.#keydownEventListener);
      this.addEventListener('keyup', this.#keyupEventListener);
      this.addEventListener('click', this.#clickListener);
    }

    override disconnectedCallback() {
      this.removeEventListener('click', this.#clickListener);
      this.removeEventListener('keyup', this.#keyupEventListener);
      this.removeEventListener('keydown', this.#keydownEventListener);
      super.disconnectedCallback();
    }

    #keydownEventListener = function (this: HTMLRoleButtonElement, event: KeyboardEvent) {
      // The button is activated by space on the keyup event, but the
      // default action for space has already been triggered on keydown. It needs
      // to be prevented before activating the button.
      if (event.key === ' ') {
        event.preventDefault();
      }
      // If enter is pressed, activate the button (on keydown).
      else if (event.key === 'Enter') {
        event.preventDefault();
        // noinspection JSUnresolvedReference — it is a button element and it has click().
        this.click();
      }
    }.bind(this);

    #keyupEventListener = function (this: HTMLRoleButtonElement, event: KeyboardEvent) {
      // If space is pressed, active the button (on keyup).
      if (event.key === ' ') {
        event.preventDefault();
        // noinspection JSUnresolvedReference — it is a button element and it has click()
        this.click();
      }
    }.bind(this);

    #clickListener = function (this: HTMLRoleButtonElement) {
      this.clicked();
    }.bind(this);

    clicked() {}
  };
}
