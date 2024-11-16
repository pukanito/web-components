// noinspection ES6RedundantNestingInTemplateLiteral - to silence warnings about comments inside style strings as ${..}.

// TODO: because 'node_modules/typescript/lib/lib.dom.d.ts' 'CustomStateSet' does not yet contain the 'Set' methods.
declare global {
  interface CustomStateSet extends Set<string> {}
}

/**
 * Module that sets up custom elements to implement a carousel.
 *
 * Autorotation, navigation (picker/tabs) and/or progress indicator are optional.
 *
 * It tries to set WCAG attributes as good as possible, but it does not set any 'aria-label' or 'aria-labelledby'.
 * The user has to set these themselves on the custom attributes where necessary.
 */
// TODO: Temporary dataPrefix so that it compiles.
export const dataPrefix = 'demo-';
// Counter for creating unique ID's of slides.
let idCounter = 0;

/**
 * Create a unique id.
 */
function getId() {
  return `${Date.now()}-${dataPrefix}-carousel-${++idCounter}`.replace(
    '--',
    '-'
  );
}

/**
 * Get an element selector with the correct prefix, if a prefix is present.
 */
function getElementSelector(selector: any) {
  return !!dataPrefix ? `${dataPrefix}${selector}` : selector;
}

/**
 * Define a custom element and use the 'data-prefix' attribute of the script tag as a prefix for the tag name.
 */
function defineCustomElementWithDataIdPrefix(name: any, constructor: any) {
  customElements.define(getElementSelector(name), constructor);
}

/**
 * Elements that have a default slot and styling in uppercase.
 */
const autoSlottedElements = [
  getElementSelector('carousel-previous-button'),
  getElementSelector('carousel-next-button'),
  getElementSelector('carousel-autorotation-button'),
  getElementSelector('carousel-picker'),
  getElementSelector('carousel-progress'),
  getElementSelector('carousel-tab-list'),
].map((tagName) => tagName.toUpperCase());

/**
 * Return true if an element has a default slot in the carousel container.
 */
function isAutoSlottedInContainer(element: any) {
  return autoSlottedElements.includes(element.tagName.toUpperCase());
}

/**
 * Apply styling and innerHtml to an HTMLElement, and set a slot name.
 */
class StyledElement extends HTMLElement {
  // The required styling for the element (optional, default is no styling).
  #style;
  // The innerHtml of the element (optional, defaults to <slot></slot>).
  #html;
  // The slot to attach the element to (optional, default is no slot to attach to).
  #slot;

  /**
   * @param style the styling for the custom element (defaults to '').
   * @param html the HTML for the custom element (defaults to <slot></slot>)
   * @param slot the slot name when placed inside another custom element (defaults to none).
   */
  constructor(style?: any, html?: any, slot?: any) {
    super();
    // Ignore style and slot if the element would be auto slotted and is not a direct child of the carousel container.
    const ignoreStyleAndSlot =
      isAutoSlottedInContainer(this) &&
      this.parentElement !== this.getParentCarouselContainer();
    this.#style = ignoreStyleAndSlot ? undefined : style;
    this.#html = html;
    this.#slot =
      this.getAttribute('slot') ?? (ignoreStyleAndSlot ? undefined : slot);
  }

  connectedCallback() {
    // Set the shadow HTML.
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML =
      typeof this.#html !== 'undefined' ? this.#html : `<slot></slot>`;
    // Set the shadow style.
    if (typeof this.#style !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = this.#style;
      shadowRoot.appendChild(style);
    }
    // Attach to the correct slot of a parent container, if applicable.
    if (typeof this.#slot !== 'undefined') {
      this.setAttributeIfUndefined('slot', this.#slot);
    }
  }

  /**
   * Get the carousel container that is parent of this StyledElement.
   */
  getParentCarouselContainer() {
    return this.closest(getElementSelector('carousel-container'));
  }

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

/**
 * A Carousel has several slots (in DOM order):
 * - <default> (for content without the 'slot' attribute),
 * - previous (for the previous button),
 * - rotation (for the autorotation button),
 * - next (for the next button),
 * - before-viewport (for user content that should appear before the slides in DOM),
 * - slides (for the slides),
 * - after-viewport (for user content that should appear after the slides in DOM),
 * - navigation (for optional navigation): progress, picker or tabs.
 *
 * Slides are placed in a viewport div, the navigation is placed in a slot below all slides.
 */
class CarouselContainerElement extends StyledElement {
  // The carousel viewport element.
  #carouselViewport: any;
  // Internals for handling state.
  #internals: ElementInternals;
  // slideQueue: [{ slide: number, x: number }], contains two or more elements while sliding.
  #slideQueue: { slide: number; x: number }[] = [];
  // State of the carousel.
  carouselState: any;
  // Setter for autorotate state.
  autorotate: (playing: boolean) => void = () => {};
  // Used in #scrollEventListener to keep track of the currently closest slide.
  closestSlideNumber: number = -1;

  constructor() {
    super(
      `
        :host {
          ${
            /* Take full width and set width to a value different from 'auto'. */ ''
          }
          display: block;
        }

        ${
          /* carousel-viewport is a direct child of the carousel-container and contains all slides. */ ''
        }
        .carousel-viewport {
          ${/* Take full width of parent.  */ ''}
          display: flex;
          ${
            /* Scroll horizontal overflow (the slides), and snap horizontally. */ ''
          }
          overflow-x: scroll;
          scroll-behavior: smooth;
          scroll-snap-type: x mandatory;

          ${/* Make the scrollbar invisible. */ ''}
          @supports selector(::-webkit-scrollbar) {
            &::-webkit-scrollbar {
              width: 0;
            }

            &::-webkit-scrollbar-track {
              background: transparent;
            }

            &::-webkit-scrollbar-thumb {
              background: transparent;
              border: none;
            }
          }

          ${/* Make the scrollbar invisible. */ ''}
          @supports (scrollbar-color: auto) {
            & {
              scrollbar-color: transparent transparent; /* thumb and track color */
              scrollbar-width: none;
            }
          }
        }
      `,
      `<slot></slot><slot
                name="previous"></slot><slot
                name="rotation"></slot><slot
                name="next"></slot><slot
                name="before-viewport"></slot><div
                class="carousel-viewport"><slot name="slides"></slot></div><slot
                name="after-viewport"></slot><slot
                name="navigation"></slot>`
    );
    this.carouselState = {
      // Slide to go to.
      gotoSlideNumber: 1,
      // All slides.
      slides: [],
      // All slides 'scrollLeft' position. Dynamically updated when resizing.
      slidesScrollX: [],
      // Dynamically updated during sliding.
      slideFromNumber: 0,
      slideToNumber: 0,
      currentSlideNumber: 0,
      closestSlideNumber: 0,
      setNewSlideFocus: false,
      // Autorotation manager, only if there are one or more autorotation buttons.
      autorotationManager: null,
    };
    this.#internals = this.attachInternals();
  }

  override connectedCallback() {
    super.connectedCallback();
    // Set WCAG attributes if not set already.
    this.setAttributeIfUndefined('role', 'group');
    this.setAttributeIfUndefined('aria-roledescription', 'carousel');
    // Cache the carousel viewport because it is used often in other methods.
    this.#carouselViewport =
      this.shadowRoot?.querySelector('.carousel-viewport');
    // Keep track of scrolling for dispatching custom events.
    this.#carouselViewport.addEventListener(
      'scroll',
      this.#scrollEventListener
    );
    // Keep track of viewport size for recalculating 'slidesScrollX'.
    this.#resizeObserver.observe(this.#carouselViewport);
    // Set scroll behavior of the viewport, if applicable.
    if (this.getAttribute('slide-scroll-behavior') === 'instant') {
      this.#carouselViewport.style['scroll-behavior'] = 'auto';
    }
    // Initialize after all carousel elements have been read.
    setTimeout(() => this.#initializeCarouselAfterCarouselIsLoaded(), 0);
  }

  disconnectedCallback() {
    this.#carouselViewport.removeEventListener(
      'scroll',
      this.#scrollEventListener
    );
    this.#resizeObserver.unobserve(this.#carouselViewport);
    if (this.carouselState.autorotationManager) {
      this.removeEventListener('mouseenter', this.#mouseenterEventListener);
      this.removeEventListener('mouseleave', this.#mouseleaveEventListener);
      this.removeEventListener('focusin', this.#focusInEventListener);
      this.removeEventListener('focusout', this.#focusOutEventListener);
    }
  }

  /**
   * Intent to scroll to the specified slide.
   *
   * Scrolling may be busy which may cause the current intent to be delayed till after
   * the current scrolling has finished.
   *
   * @param num the number of the slide to scroll to, first slide is 1.
   */
  scrollToSlide(num: any) {
    const slideQueueLength = this.#slideQueue.length;
    // Don't accept queue items when the queue is too long.
    if (slideQueueLength > 2) return;
    if (slideQueueLength > 0) {
      // Append to queue, but only if valid and different from last slide in the queue.
      if (
        num < 1 ||
        num > this.carouselState.slides.length ||
        num === this.#slideQueue[slideQueueLength - 1].slide
      )
        return;
      // Check direction of new scroll intent.
      const direction =
        this.#slideQueue[slideQueueLength - 1].x -
        this.#slideQueue[slideQueueLength - 2].x;
      const newDirection =
        this.carouselState.slidesScrollX[num - 1] -
        this.#slideQueue[slideQueueLength - 1].x;
      const xorDirection = direction * newDirection;
      if (xorDirection === 0) return;
      if (xorDirection < 0) {
        // Append if the new direction differs from the last direction.
        // Scroll only allows updating the destination when the direction is the same.
        this.#slideQueue.push({
          slide: num,
          x: this.carouselState.slidesScrollX[num - 1],
        });
      } else {
        // Update the destination in the queue.
        this.#slideQueue[slideQueueLength - 1].slide = num;
        this.#slideQueue[slideQueueLength - 1].x =
          this.carouselState.slidesScrollX[num - 1];
        if (slideQueueLength === 2) {
          // Scroll to the new destination if it is the current scrolling.
          this.#doScrollToSlide(this.#slideQueue[0].slide, num);
        }
      }
      return;
    }
    // Empty slide queue, add new scroll.
    const fromSlide =
      this.carouselState.slideFromNumber || this.#currentSlideNum();
    if (fromSlide === num) return;
    const fromX = this.carouselState.slidesScrollX[fromSlide - 1];
    const toX = this.carouselState.slidesScrollX[num - 1];
    this.#slideQueue.push(
      { slide: fromSlide, x: fromX },
      { slide: num, x: toX }
    );
    this.#doScrollToSlide(fromSlide, num);
  }

  /**
   * Scroll to the previous slide.
   */
  scrollToPrevious() {
    if (this.carouselState.currentSlideNumber <= 1) {
      this.scrollToSlide(this.carouselState.slides.length);
    } else {
      this.scrollToSlide(this.carouselState.currentSlideNumber - 1);
    }
  }

  /**
   * Scroll to the next slide.
   */
  scrollToNext() {
    if (
      this.carouselState.currentSlideNumber >= this.carouselState.slides.length
    ) {
      this.scrollToSlide(1);
    } else {
      this.scrollToSlide(this.carouselState.currentSlideNumber + 1);
    }
  }

  /**
   * Go to a specific slide without scrolling and without 'slide' event.
   */
  gotoSlide(num: any) {
    if (this.carouselState.currentSlideNumber) {
      //  If already initialize, go directly.
      this.#gotoSlide(num);
    } else {
      // If not yet initialized, specify initial slide number to go to when initializing.
      this.carouselState.gotoSlideNumber = num;
    }
  }

  #gotoSlide(num: any) {
    this.#internals.states.clear();
    this.#internals.states.add(`slide-${num}`);
    if (num === 1) this.#internals.states.add('first');
    if (num === this.carouselState.slides.length)
      this.#internals.states.add('last');
    const from = this.carouselState.currentSlideNumber;
    this.carouselState.currentSlideNumber = num;
    this.carouselState.closestSlideNumber = num;
    this.carouselState.gotoSlideNumber = 0;
    this.#carouselViewport.scrollTo({
      left: this.carouselState.slidesScrollX[num - 1],
      top: 0,
      behavior: 'instant',
    });
    this.#dispatchEvent(
      this.#createEvent('slid.carousel', { from, to: num }, false)
    );
    this.#dispatchEvent(
      this.#createEvent('closest.carousel', { closest: num }, false)
    );
  }

  /**
   * Initialize the carousel after all HTML has been read.
   */
  #initializeCarouselAfterCarouselIsLoaded() {
    // Force this.carouselState.slidesScrollX to be calculated before going to a specific slide.
    // noinspection JSPotentiallyInvalidUsageOfThis - it is bound to 'this'.
    this.#observeViewportResize();
    // Set initial state.
    if (this.carouselState.currentSlideNumber === 0)
      this.#gotoSlide(this.carouselState.gotoSlideNumber);
    this.#inertNotCurrentSlides();
    // Attach AutorotationManager if there are autorotation buttons.
    this.#initializeAutorotation();
    // Initialize other carousel elements.
    this.#dispatchEvent(this.#createEvent('init.carousel', {}, false));
  }

  /**
   * Initialize autorotation, must be done after all HTML has been read.
   */
  #initializeAutorotation() {
    const autorotationButtons = this.querySelectorAll(
      getElementSelector('carousel-autorotation-button')
    );
    if (autorotationButtons.length > 0) {
      // Set WCAG attributes and handlers.
      this.#carouselViewport.setAttribute('aria-atomic', 'false');
      this.autorotate = (playing) => {
        if (playing) {
          this.#carouselViewport.setAttribute('aria-live', 'off');
        } else {
          this.#carouselViewport.setAttribute('aria-live', 'polite');
        }
      };
      // Set autorotation manager.
      this.carouselState.autorotationManager = new AutorotationManager(
        this,
        autorotationButtons
      );
      // Set slide delay if applicable.
      if (this.getAttribute('slide-delay')) {
        this.carouselState.autorotationManager.setDelay(
          Number(this.getAttribute('slide-delay'))
        );
      }
      // Check for cursor position and focus to pause/stop autorotation.
      this.addEventListener('mouseenter', this.#mouseenterEventListener);
      this.addEventListener('mouseleave', this.#mouseleaveEventListener);
      this.addEventListener('focusin', this.#focusInEventListener);
      this.addEventListener('focusout', this.#focusOutEventListener);
    }
  }

  /**
   * Scroll to the specified slide.
   *
   * If the specified slide does not exist, nothing will happen.
   * If the specified slide is already the current slide, nothing will happen.
   *
   * @param fromSlide the number of the starting slide to scroll from, first slide is 1
   * @param toSlide the number of the slide to scroll to, first slide is 1.
   */
  #doScrollToSlide(fromSlide: any, toSlide: any) {
    if (
      toSlide < 1 ||
      toSlide > this.carouselState.slides.length ||
      toSlide === this.carouselState.currentSlideNumber
    )
      return;
    // Dispatch scroll start event, when cancelled don't scroll, and cancel remaining slide queue.
    if (
      !this.#dispatchEvent(
        this.#createEvent(
          'slide.carousel',
          { from: fromSlide, to: toSlide },
          true
        )
      )
    ) {
      this.#slideQueue = [];
      return;
    }

    // Set scrolling parameters.
    this.carouselState.setNewSlideFocus =
      this.carouselState.slides[fromSlide - 1] ===
      document.activeElement?.closest(getElementSelector('carousel-slide'));
    this.carouselState.slideFromNumber = fromSlide;
    this.carouselState.slideToNumber = toSlide;
    // Perform the scroll.
    this.#carouselViewport.scrollTo(
      this.carouselState.slidesScrollX[toSlide - 1],
      0
    );
  }

  /**
   * Scroll event listener: after scrolling to a new slide, set new state and fire the 'slid' event.
   */
  #scrollEventListener = function (this: CarouselContainerElement) {
    // Set closest picker button, but only if different from the previous closest.
    const closest = this.#closestSlideNum();
    if (closest !== this.closestSlideNumber) {
      this.#dispatchEvent(
        this.#createEvent(
          'closest.carousel',
          { closest: this.#closestSlideNum() },
          false
        )
      );
      this.closestSlideNumber = this.#closestSlideNum();
    }
    const currentSlide = this.#currentSlideNum();
    // Check if scrolling is finished: it is the destination, or there is no destination.
    if (
      currentSlide !== 0 &&
      [currentSlide, 0].includes(this.carouselState.slideToNumber)
    ) {
      // Prepare parameter for 'slid' event.
      const slidEventDetail = {
        from: this.carouselState.slideFromNumber,
        to: this.carouselState.slideToNumber || currentSlide,
      };
      // Update carousel state.
      this.carouselState.currentSlideNumber = currentSlide;
      this.carouselState.slideFromNumber = 0;
      this.carouselState.slideToNumber = 0;
      this.#internals.states.clear();
      this.#internals.states.add(`slide-${currentSlide}`);
      if (currentSlide === 1) this.#internals.states.add('first');
      if (currentSlide === this.carouselState.slides.length)
        this.#internals.states.add('last');
      // Inert unavailable slides.
      this.#inertNotCurrentSlides();
      // Set focus if applicable.
      if (this.carouselState.setNewSlideFocus) {
        this.carouselState.slides[currentSlide - 1]
          .querySelector('[slide-autofocus]')
          ?.focus();
        this.carouselState.setNewSlideFocus = false;
      }
      // Fire 'slid' event.
      this.#dispatchEvent(
        this.#createEvent('slid.carousel', slidEventDetail, false)
      );
      // Check and update slide queue.
      this.#slideQueue = this.#slideQueue.slice(1);
      if (this.#slideQueue.length <= 1) {
        // Ready scrolling.
        this.#slideQueue = [];
      } else {
        // Apply next scroll.
        this.#doScrollToSlide(
          this.#slideQueue[0].slide,
          this.#slideQueue[1].slide
        );
      }
    }
  }.bind(this);

  /**
   * Mouseover/mouseleave/focusin/focusout event listeners: to pause and start autorotation.
   */
  #mouseenterEventListener = function (this: CarouselContainerElement) {
    this.carouselState.autorotationManager?.onMouseenter();
  }.bind(this);

  #mouseleaveEventListener = function (this: CarouselContainerElement) {
    this.carouselState.autorotationManager?.onMouseleave();
  }.bind(this);

  #focusInEventListener = function (
    this: CarouselContainerElement,
    event: any
  ) {
    this.carouselState.autorotationManager?.onFocus(event);
  }.bind(this);

  #focusOutEventListener = function (
    this: CarouselContainerElement,
    event: any
  ) {
    this.carouselState.autorotationManager?.onBlur(event);
  }.bind(this);

  /**
   * ResizeObserver for observing the width of the carousel viewport. When it changes, recalculate 'slidesScrollX'.
   */
  #observeViewportResize = function (this: CarouselContainerElement) {
    this.carouselState.slidesScrollX = [];
    const viewportWidth = this.#carouselViewport.getBoundingClientRect().width;
    this.carouselState.slides.forEach((slide: any, index: any) => {
      this.carouselState.slidesScrollX.push(
        this.carouselState.slides
          .slice(0, index)
          .reduce(
            (acc: any, slide: any) => acc + slide.getBoundingClientRect().width,
            0
          ) -
          (viewportWidth - slide.getBoundingClientRect().width) / 2
      );
    });
  }.bind(this);

  #resizeObserver = new ResizeObserver(this.#observeViewportResize);

  /**
   * Dispatch the given event on the carousel container.
   *
   * @param event the Event to dispatch.
   */
  #dispatchEvent(event: any) {
    return this.dispatchEvent(event);
  }

  /**
   * Create a new CustomEvent that will propagate across the shadow boundary.
   *
   * @param eventName the name of the event.
   * @param detail the detail data of the event.
   * @param cancelable true if cancelable, false if not.
   */
  #createEvent(eventName: any, detail: any, cancelable: any) {
    return new CustomEvent(eventName, { cancelable, composed: true, detail });
  }

  /**
   * Return the current slide number, or 0 when it could not be determined (because it is busy scrolling).
   */
  #currentSlideNum() {
    return (
      this.carouselState.slidesScrollX.findIndex((x: any) => {
        return Math.abs(this.#carouselViewport.scrollLeft - x) < 1;
      }) + 1
    );
  }

  /**
   * Return the closest slide.
   */
  #closestSlideNum() {
    const x = this.#carouselViewport.scrollLeft;
    return (
      this.carouselState.slidesScrollX.reduce(
        (p: any, c: any, i: any, a: any) => {
          return Math.abs(a[p] - x) < Math.abs(c - x) ? p : i;
        }
      ) + 1
    );
  }

  /**
   * Activate the current slide and inert all others.
   */
  #inertNotCurrentSlides() {
    this.carouselState.slides.forEach((slide: any) => {
      if (slide.slideState.slideNum === this.carouselState.currentSlideNumber) {
        this.#activateSlide(slide);
      } else {
        this.#inertSlide(slide);
      }
    });
  }

  /**
   * Add the 'inert' attribute to the specified slide Element.
   *
   * @param slide the slide Element to add the 'inert' attribute to.
   */
  #inertSlide(slide: any) {
    slide.setAttribute('inert', '');
  }

  /**
   * Remove the 'inert' attribute from the specified slide Element.
   *
   * @param slide the slide Element to remove the 'inert' attribute from.
   */
  #activateSlide(slide: any) {
    slide.removeAttribute('inert');
  }
}
defineCustomElementWithDataIdPrefix(
  'carousel-container',
  CarouselContainerElement
);

/**
 * A slide for the carousel. Automatically uses the 'slides' slot.
 */
class CarouselSlideElement extends StyledElement {
  slideState: { slideNum: number } = { slideNum: -1 };

  constructor() {
    super(
      `
        :host {
          ${
            /* Allow absolute positioning inside the slide, used for the snapper. */ ''
          }
          position: relative;
          ${
            /* The slide will not grow nor shrink and take 100% of its parents' width. */ ''
          }
          flex: 0 0 100%;
          width: 100%;
        }

        ${
          /* For scroll snapping, the carousel-snapper sits at the top of the slide and has height 0. */ ''
        }
        ${/* The snapper is invisible and takes no space. */ ''}
        .carousel-snapper {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          scroll-snap-align: center;
        }
      `,
      `<div class="carousel-snapper"></div><slot></slot>`,
      'slides'
    );
    const carouselState = this.getParentCarouselContainer().carouselState;
    carouselState.slides.push(this);
    this.slideState = {
      slideNum: carouselState.slides.length,
    };
  }

  override connectedCallback() {
    super.connectedCallback();
    // Set WCAG attributes.
    // Attributes are for carousel usage without tablist/tabs. Tab element may overwrite these.
    this.setAttributeIfUndefined('role', 'group');
    this.setAttributeIfUndefined('aria-roledescription', 'slide');
  }
}
defineCustomElementWithDataIdPrefix('carousel-slide', CarouselSlideElement);

/**
 * Make a StyledElement a button by adding:
 * - role="button",
 * - tabindex="0",
 * - keydown/keyup handlers for enter and space keys.
 */
class HTMLRoleButtonElement extends StyledElement {
  /**
   * @param style the extra styling for the button element (defaults to '').
   * @param slot the slot name when placed inside another custom element (defaults to none).
   */
  constructor(style?: any, slot?: any) {
    super(style, undefined, slot);
  }

  override connectedCallback() {
    super.connectedCallback();
    // Make it a button.
    this.setAttributeIfUndefined('role', 'button');
    this.setAttributeIfUndefined('tabindex', '0');
    this.addEventListener('keydown', this.#keydownEventListener);
    this.addEventListener('keyup', this.#keyupEventListener);
    this.addEventListener('click', this.#clickListener);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#clickListener);
    this.removeEventListener('keyup', this.#keyupEventListener);
    this.removeEventListener('keydown', this.#keydownEventListener);
  }

  #keydownEventListener = function (this: HTMLRoleButtonElement, event: any) {
    // The action button is activated by space on the keyup event, but the
    // default action for space is already triggered on keydown. It needs to be
    // prevented to stop scrolling the page before activating the button.
    if (event.keyCode === 32) {
      event.preventDefault();
    }
    // If enter is pressed, activate the button (on keydown).
    else if (event.keyCode === 13) {
      event.preventDefault();
      // noinspection JSUnresolvedReference - it is a button element and it has click().
      this.click();
    }
  }.bind(this);

  #keyupEventListener = function (this: HTMLRoleButtonElement, event: any) {
    // If space is pressed, active the button (on keyup).
    if (event.keyCode === 32) {
      event.preventDefault();
      // noinspection JSUnresolvedReference - it is a button element and it has click()
      this.click();
    }
  }.bind(this);

  #clickListener = function (this: HTMLRoleButtonElement) {
    this.clicked();
  }.bind(this);

  clicked() {}
}

/**
 * A carousel slide button that scrolls to a specific slide.
 */
class CarouselButtonElement extends HTMLRoleButtonElement {
  // The slide to go to.
  slideNum: any;
  // The carousel container.
  #carouselContainer: any;
  // Internals for handling state.
  internals;

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.slideNum = Number(this.getAttribute('slide'));
    this.#carouselContainer = this.getParentCarouselContainer();
    this.#carouselContainer.addEventListener(
      'slid.carousel',
      this.#slidEventListener
    );
  }

  override disconnectedCallback() {
    this.#carouselContainer.removeEventListener(
      'slid.carousel',
      this.#slidEventListener
    );
    super.disconnectedCallback();
  }

  override clicked() {
    this.#carouselContainer.scrollToSlide(this.slideNum);
  }

  #slidEventListener = function (this: CarouselButtonElement, event: any) {
    // Set the current state on the button if it is a button to go to the current slide.
    if (event.detail.to === this.slideNum) {
      this.internals.states.add('current');
      this.setAttribute('aria-disabled', 'true');
    } else {
      this.internals.states.delete('current');
      this.removeAttribute('aria-disabled');
    }
  }.bind(this);
}
defineCustomElementWithDataIdPrefix('carousel-button', CarouselButtonElement);

/**
 * Base class for a carousel previous/next buttons.
 *
 * It is a custom element that gets:
 * - style: absolute positioning, full height, 15% width and positioned at top 0,
 * - role: button,
 */
class CarouselPreviousNextButtonElement extends HTMLRoleButtonElement {
  /**
   * @param style the extra styling for the button element (defaults to '').
   * @param slot the slot name when placed inside another custom element (defaults to none).
   */
  constructor(style: any, slot: any) {
    super(
      `
        :host {
          ${
            /* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''
          }
          ${
            /* This way the user can position the button everywhere, inside or outside the carousel. */ ''
          }
          position: absolute;
          top: 0;
          width: 15%;
          height: 100%;
        }

        ${style ?? ''}
      `,
      slot
    );
  }
}

/**
 * The previous button for navigating the carousel.
 *
 * Default at 'left: 0'.
 */
class CarouselPreviousSlideButtonElement extends CarouselPreviousNextButtonElement {
  constructor() {
    super(
      `
        :host {
          left: 0;
        }
      `,
      'previous'
    );
  }

  override clicked() {
    this.getParentCarouselContainer().scrollToPrevious();
  }
}
defineCustomElementWithDataIdPrefix(
  'carousel-previous-button',
  CarouselPreviousSlideButtonElement
);

/**
 * The next button for navigating the carousel.
 *
 * Default at 'right: 0'.
 */
class CarouselNextSlideButtonElement extends CarouselPreviousNextButtonElement {
  constructor() {
    super(
      `
        :host {
          right: 0;
        }
      `,
      'next'
    );
  }

  override clicked() {
    this.getParentCarouselContainer().scrollToNext();
  }
}
defineCustomElementWithDataIdPrefix(
  'carousel-next-button',
  CarouselNextSlideButtonElement
);

/**
 * Manages all autorotation.
 *
 * All autorotation buttons in the carousel should have the same state. The manager manages this.
 *
 * The initial state is: playing.
 *
 * Moving the mouse in or out of the carousel changes state:
 * - pausing → playing: when the mouse leaves the carousel,
 * - playing → pausing: when mouse enters the carousel,
 *
 * Moving the focus in or out of the carousel changes state:
 * - playing → stopped: when the focus enters the carousel.
 * - pausing → stopped: when the focus enters the carousel.
 * - starting → playing: when the focus leaves the carousel and the mouse is not inside the carousel.
 * - starting → pausing: when the focus leaves the carousel and the mouse is inside the carousel.
 *
 * Clicking an autorotation button switches state:
 * - playing → stopped,
 * - pausing → stopped,
 * - starting → stopped,
 * - stopped → starting (only when the click did not cause a focus, switches to playing when the focus leaves the carousel),
 *
 * Focus in occurs on mouse down, click occurs on mouse up. We do not want a mouse click to cause a:
 * - focus (causing the carousel to stop) and a
 * - click (causing the carousel to start).
 * therefore we keep track of #ignoreClickAfterFocus so that a click causing focus does not immediately restart the carousel.
 */
class AutorotationManager {
  // The carousel container that contains the autorotation manager.
  #carouselContainer: CarouselContainerElement;
  // All autorotation button elements.
  #buttons = [];
  // The delay between auto-rotating slides in ms.
  #delayBetweenSlidesMs = 3000;
  // The timeout handle for autorotation.
  #timeoutHandle: any = null;
  // The current state of the button: playing, pausing or stopped.
  #playState: any;
  // The current state of the hover.
  #hovered = false;
  // The current state of focus.
  #focused = false;
  // When a focus will cause a click because the element was focused by the mouse button.
  #ignoreClickAfterFocus = false;

  // The possible states.
  #PLAYING = 'playing';
  #PAUSING = 'pausing';
  #STOPPED = 'stopped';
  #STARTING = 'starting';

  constructor(carouselContainer: any, buttons: any) {
    this.#carouselContainer = carouselContainer;
    this.#buttons = buttons;
    this.#play();
  }

  /**
   * Set delay between slides in ms.
   */
  setDelay(ms: any) {
    this.#delayBetweenSlidesMs = ms;
    // Force new timeout to be used.
    this.#setState(this.#playState);
  }

  /**
   * State change on clicking an autorotation button.
   */
  onClick() {
    switch (this.#playState) {
      case this.#PLAYING:
      case this.#PAUSING:
      case this.#STARTING:
        this.#stop();
        break;
      case this.#STOPPED:
        if (!this.#ignoreClickAfterFocus) {
          this.#start();
        }
        this.#ignoreClickAfterFocus = false;
        break;
    }
  }

  /**
   * State change on mouse hovering any element of the carousel.
   */
  onMouseenter() {
    this.#ignoreClickAfterFocus = false;
    this.#hovered = true;
    if (this.#playState === this.#PLAYING) {
      this.#pause();
    }
  }

  /**
   * State change on mouse leaving the carousel.
   */
  onMouseleave() {
    this.#ignoreClickAfterFocus = false;
    this.#hovered = false;
    if (this.#playState === this.#PAUSING) {
      this.#play();
    }
  }

  /**
   * State change on focusing any element of the carousel.
   */
  onFocus(event: any) {
    this.#ignoreClickAfterFocus = false;
    // Only change focus when previously not inside the carousel and now inside the carousel.
    const from = event.relatedTarget?.closest(
      getElementSelector('carousel-container')
    );
    const to = event.target?.closest(getElementSelector('carousel-container'));
    if (from !== to && to === this.#carouselContainer) {
      this.#focused = true;
      // Ignore click after focus only when the carousel was not already stopped.
      // Focus by mousedown causes the carousel to stop, click on subsequent mouseup would cause it to start,
      // but we don't want that. Hence, when stopped we want to ignore the next immediate click.
      this.#ignoreClickAfterFocus = this.#playState !== this.#STOPPED;
      this.#stop();
    }
  }

  /**
   * State change on blurring the carousel.
   */
  onBlur(event: any) {
    this.#ignoreClickAfterFocus = false;
    // Only change focus when previously inside the carousel and now not inside the carousel.
    const from = event.target?.closest(
      getElementSelector('carousel-container')
    );
    const to = event.relatedTarget?.closest(
      getElementSelector('carousel-container')
    );
    if (from !== to && from === this.#carouselContainer) {
      this.#focused = false;
      if (this.#playState === this.#STARTING) {
        if (this.#hovered) {
          this.#pause();
        } else {
          this.#play();
        }
      }
    }
  }

  #play() {
    this.#setState(this.#PLAYING);
  }

  #pause() {
    this.#setState(this.#PAUSING);
  }

  #stop() {
    this.#setState(this.#STOPPED);
  }

  #start() {
    this.#setState(this.#STARTING);
  }

  /**
   * Set specified state and restart timeout handler.
   */
  #setState(state: any) {
    this.#buttons.forEach((b: any) => b.setState(state));
    this.#playState = state;
    if (this.#timeoutHandle) {
      clearTimeout(this.#timeoutHandle);
    }
    this.#timeoutHandle = setTimeout(
      this.#onTimeout,
      this.#delayBetweenSlidesMs
    );
    this.#carouselContainer.autorotate(this.#playState === this.#PLAYING);
  }

  /**
   * Timeout handler: slide to next slide when playing.
   */
  #onTimeout = function (this: AutorotationManager) {
    if (this.#playState === this.#PLAYING) {
      this.#carouselContainer.scrollToNext();
      this.#timeoutHandle = setTimeout(
        this.#onTimeout,
        this.#delayBetweenSlidesMs
      );
    }
  }.bind(this);
}

/**
 * The autorotation button.
 *
 * It is a custom element that gets:
 * - style: absolute positioning, full height, 70% width and positioned at top 0, centered,
 * - role: button,
 */
class CarouselAutoRotationButtonElement extends HTMLRoleButtonElement {
  // Internals for handling state.
  #internals;

  constructor() {
    super(
      `
          :host {
            ${
              /* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''
            }
            ${
              /* This way the user can position the button everywhere, inside or outside the carousel. */ ''
            }
            position: absolute;
            top: 0;
            left: auto;
            right: auto;
            width: 70%;
            height: 20%;
          }
        `,
      'rotation'
    );
    this.#internals = this.attachInternals();
  }

  override clicked() {
    this.getParentCarouselContainer().carouselState.autorotationManager.onClick();
  }

  setState(state: any) {
    this.#internals.states.clear();
    this.#internals.states.add(state);
  }
}
defineCustomElementWithDataIdPrefix(
  'carousel-autorotation-button',
  CarouselAutoRotationButtonElement
);

/**
 * The picker navigation element for the carousel, contains picker buttons.
 */
class CarouselPickerElement extends StyledElement {
  constructor() {
    super(
      `
          :host {
            ${
              /* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''
            }
            ${
              /* This way the user can position the picker element everywhere, inside or outside the carousel. */ ''
            }
            position: absolute;
            right: auto;
            bottom: 0;
            left: auto;
          }
        `,
      undefined,
      'navigation'
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    // Set WCAG attributes.
    this.setAttributeIfUndefined('role', 'group');
  }
}
defineCustomElementWithDataIdPrefix('carousel-picker', CarouselPickerElement);

/**
 * The picker button element for the carousel picker.
 */
class CarouselPickerButtonElement extends CarouselButtonElement {
  override connectedCallback() {
    super.connectedCallback();
    this.getParentCarouselContainer().addEventListener(
      'closest.carousel',
      this.#closestEventListener
    );
  }

  override disconnectedCallback() {
    this.getParentCarouselContainer().removeEventListener(
      'closest.carousel',
      this.#closestEventListener
    );
    super.disconnectedCallback();
  }

  #closestEventListener = function (
    this: CarouselPickerButtonElement,
    event: any
  ) {
    if (this.slideNum === event.detail.closest) {
      this.internals.states.add('closest');
    } else {
      this.internals.states.delete('closest');
    }
  }.bind(this);
}
defineCustomElementWithDataIdPrefix(
  'carousel-picker-button',
  CarouselPickerButtonElement
);

/**
 * The progress element for the carousel, contains progress items.
 */
class CarouselProgressElement extends StyledElement {
  constructor() {
    super(
      `
          :host {
            ${
              /* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''
            }
            ${
              /* This way the user can position the progress element everywhere, inside or outside the carousel. */ ''
            }
            position: absolute;
            right: auto;
            top: 0;
            left: auto;
          }
        `,
      undefined,
      'navigation'
    );
  }
}
defineCustomElementWithDataIdPrefix(
  'carousel-progress',
  CarouselProgressElement
);

/**
 * A carousel progress item, indicates progress in the carousel.
 */
class CarouselProgressItemElement extends StyledElement {
  // The slide to go to.
  slideNum: any;
  // The carousel container.
  carouselContainer: any;
  // Internals for handling state.
  internals;

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.slideNum = Number(this.getAttribute('slide'));
    this.carouselContainer = this.getParentCarouselContainer();
    this.carouselContainer.addEventListener(
      'slid.carousel',
      this.#slidEventListener
    );
    this.carouselContainer.addEventListener(
      'closest.carousel',
      this.#closestEventListener
    );
  }

  disconnectedCallback() {
    this.carouselContainer.removeEventListener(
      'closest.carousel',
      this.#closestEventListener
    );
    this.carouselContainer.removeEventListener(
      'slid.carousel',
      this.#slidEventListener
    );
  }

  #slidEventListener = function (
    this: CarouselProgressItemElement,
    event: any
  ) {
    // Set the current state on the progress item if it is an item showing the current slide progress.
    if (event.detail.to === this.slideNum) {
      this.internals.states.add('current');
    } else {
      this.internals.states.delete('current');
    }
  }.bind(this);

  #closestEventListener = function (
    this: CarouselProgressItemElement,
    event: any
  ) {
    if (this.slideNum === event.detail.closest) {
      this.internals.states.add('closest');
    } else {
      this.internals.states.delete('closest');
    }
  }.bind(this);
}
defineCustomElementWithDataIdPrefix(
  'carousel-progress-item',
  CarouselProgressItemElement
);

/**
 * The tab list navigation element for the carousel, contains tab elements.
 */
class CarouselTabListElement extends StyledElement {
  // The carousel container.
  #carouselContainer: any;
  // All tabs inside this tablist in DOM order.
  #tabs: any;

  constructor() {
    super(
      `
          :host {
            ${
              /* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''
            }
            ${
              /* This way the user can position the tabs element everywhere, inside or outside the carousel. */ ''
            }
            position: absolute;
            right: auto;
            top: 0;
            left: auto;
          }
        `,
      undefined,
      'navigation'
    );
  }

  override connectedCallback() {
    super.connectedCallback();
    this.#carouselContainer = this.getParentCarouselContainer();
    // Set WCAG attributes.
    this.setAttributeIfUndefined('role', 'tablist');
    this.#carouselContainer.addEventListener(
      'init.carousel',
      this.#initEventListener
    );
    this.addEventListener('keydown', this.#keydownEventListener);
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.#keydownEventListener);
    this.#carouselContainer.removeEventListener(
      'init.carousel',
      this.#initEventListener
    );
  }

  #initEventListener = function (this: CarouselTabListElement) {
    this.#tabs = Array.from(
      this.querySelectorAll(getElementSelector('carousel-tab'))
    );
  }.bind(this);

  #keydownEventListener = function (this: CarouselTabListElement, event: any) {
    // Get the tab that currently has focus. Only one tab can have focus.
    // It must have focus, otherwise the keydown would not fire, and the tablist itself cannot have focus.
    const activeTabNum = this.#tabs.findIndex(
      (t: any) => t.getAttribute('tabindex') === '0'
    );
    switch (event.keyCode) {
      case 35: // End
        this.#activateTab(activeTabNum, this.#tabs.length - 1);
        event.preventDefault();
        break;
      case 36: // Home
        this.#activateTab(activeTabNum, 0);
        event.preventDefault();
        break;
      case 37: // ArrowLeft
        this.#activateTab(
          activeTabNum,
          (activeTabNum + this.#tabs.length - 1) % this.#tabs.length
        );
        event.preventDefault();
        break;
      case 39: // ArrowRight
        this.#activateTab(activeTabNum, (activeTabNum + 1) % this.#tabs.length);
        event.preventDefault();
        break;
    }
  }.bind(this);

  #activateTab(inactiveTabNum: any, activeTabNum: any) {
    if (inactiveTabNum === activeTabNum) return;
    const inactiveTab = this.#tabs[inactiveTabNum];
    const activeTab = this.#tabs[activeTabNum];
    // Update WCAG and tabindex, and set focus.
    activeTab.setAttribute('aria-selected', 'true');
    activeTab.setAttribute('tabindex', '0');
    activeTab.focus();
    inactiveTab.setAttribute('aria-selected', 'false');
    inactiveTab.setAttribute('tabindex', '-1');
    // Slides on tabs may be different from sequential slides order, hence get slide number to go to from the tab.
    this.#carouselContainer.scrollToSlide(
      Number(activeTab.getAttribute('slide'))
    );
  }
}
defineCustomElementWithDataIdPrefix(
  'carousel-tab-list',
  CarouselTabListElement
);

/**
 * The tab navigation element for the carousel, must be used inside a tab list.
 */
class CarouselTabElement extends CarouselProgressItemElement {
  constructor() {
    super();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.carouselContainer.addEventListener(
      'init.carousel',
      this.#initEventListener
    );
    this.carouselContainer.addEventListener(
      'slid.carousel',
      this.#slidEventListener
    );
    this.addEventListener('click', this.#clickListener);
    // Set WCAG attributes.
    this.setAttributeIfUndefined('role', 'tab');
  }

  override disconnectedCallback() {
    this.removeEventListener('click', this.#clickListener);
    this.carouselContainer.removeEventListener(
      'slid.carousel',
      this.#slidEventListener
    );
    this.carouselContainer.removeEventListener(
      'init.carousel',
      this.#initEventListener
    );
    super.disconnectedCallback();
  }

  #initEventListener = function (this: CarouselTabElement) {
    const slide =
      this.carouselContainer.carouselState.slides[this.slideNum - 1];
    const slideId = this.#getSlideId(slide);
    // Set WCAG attributes.
    this.setAttribute('aria-controls', slideId);
    // Override default slide WCAG attributes.
    slide.setAttribute('role', 'tabpanel');
    slide.removeAttribute('aria-roledescription');
  }.bind(this);

  #slidEventListener = function (this: CarouselTabElement, event: any) {
    // Update WCAG attributes and tabindex when arriving at, or leaving a tab.
    // Needed when another navigation control navigates, or autorotation changes the current slide.
    if (event.detail.to === this.slideNum) {
      this.setAttribute('aria-selected', 'true');
      this.setAttribute('tabindex', '0');
    } else {
      this.setAttribute('aria-selected', 'false');
      this.setAttribute('tabindex', '-1');
    }
  }.bind(this);

  #clickListener = function (this: CarouselTabElement) {
    // Tab clicked, scroll to the corresponding slide.
    this.carouselContainer.scrollToSlide(this.slideNum);
  }.bind(this);

  /**
   * Get slide ID, set if not already set.
   */
  #getSlideId(slide: any) {
    const slideId = slide.getAttribute('id');
    if (slideId) {
      return slideId;
    }
    const id = 'slide-' + getId();
    slide.setAttribute('id', id);
    return id;
  }
}
defineCustomElementWithDataIdPrefix('carousel-tab', CarouselTabElement);
