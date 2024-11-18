// noinspection ES6RedundantNestingInTemplateLiteral — to silence warnings about comments inside style strings as ${...}.
// This line after 'noinspection' is necessary, otherwise, when import follows directly, Intellij will not ignore the warning.
import { CustomHTMLElement } from './custom-html-element';
import { HTMLRoleButtonElement } from './html-role-button-element';

// TODO: remove declaration when no longer necessary.
//       Because 'node_modules/typescript/lib/lib.dom.d.ts' v5.5 'CustomStateSet' does not yet contain the 'Set' methods.
declare global {
  // noinspection JSUnusedGlobalSymbols — is used for 'internals.states'.
  interface CustomStateSet extends Set<string> {}
}

/**
 * Module that sets up custom elements to implement a carousel.
 *
 * It tries to set WCAG attributes as good as possible, but it does not set any 'aria-label' or 'aria-labelledby'.
 * The user has to set these themselves on the custom attributes where necessary.
 */
// TODO: Temporary dataPrefix so that it compiles.
export const dataPrefix = '';
// Counter for creating unique ID's of slides.
let idCounter = 0;

/**
 * Create a unique ID.
 */
function getId(): string {
  return `${Date.now()}-${dataPrefix}-carousel-${++idCounter}`.replace('--', '-');
}

/**
 * Get an element tag name with the correct prefix, if a prefix is present.
 */
function getElementTagName(baseTagName: string): string {
  return !!dataPrefix ? `${dataPrefix}${baseTagName}` : baseTagName;
}

/**
 * Define a custom element and use the prefix for the tag name, if a prefix is present.
 */
function defineCustomElementWithDataIdPrefix(baseTagName: string, constructor: typeof CarouselElement): void {
  customElements.define(getElementTagName(baseTagName), constructor);
}

/**
 * Apply styling and innerHtml to a CustomHTMLElement, and set a slot name.
 */
class CarouselElement extends CustomHTMLElement {
  /**
   * @param css the styling for the custom element (defaults to '').
   * @param html the HTML for the custom element (defaults to <slot></slot>)
   * @param slotName the slot name to use when placed inside another custom element (defaults to none).
   */
  constructor(private css?: string, private html?: any, private slotName?: any) {
    super();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Set the shadow HTML.
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = typeof this.html !== 'undefined' ? this.html : `<slot></slot>`;
    // Ignore style and slot if the element would be auto-slotted and is not a direct child of the carousel container.
    const ignoreStyleAndSlot =
      this.isAutoSlottedInContainer(this) && this.parentElement !== this.queryParentCarouselContainer();
    if (!ignoreStyleAndSlot) {
      // Set the shadow CSS, if applicable.
      if (typeof this.css !== 'undefined') {
        const style = document.createElement('style');
        style.textContent = this.css;
        shadowRoot.appendChild(style);
      }
      // Attach to the correct slot of a parent container, if applicable.
      if (typeof this.slotName !== 'undefined') {
        this.setAttributeIfUndefined('slot', this.slotName);
      }
    }
  }

  /**
   * Get the carousel container that is parent of this CarouselElement, or null if not found.
   */
  protected queryParentCarouselContainer(): CarouselContainerElement | null {
    return this.closest(getElementTagName('carousel-container'));
  }

  /**
   * Get the carousel container that is parent of this CarouselElement, or throw an error if not found.
   */
  protected getParentCarouselContainer(): CarouselContainerElement {
    const parentCarouselContainer = this.queryParentCarouselContainer();
    if (parentCarouselContainer) {
      return parentCarouselContainer;
    }
    throw new Error('Parent carousel container not found');
  }

  /**
   * Elements tag names that have a default slot and styling in uppercase.
   */
  private autoSlottedElements = [
    'previous-button',
    'next-button',
    'autorotation-button',
    'picker',
    'progress',
    'tab-list',
  ].map((tagName) => getElementTagName(`carousel-${tagName}`).toUpperCase());

  /**
   * Return true if an element has a default slot in the carousel container.
   */
  private isAutoSlottedInContainer(element: any) {
    return this.autoSlottedElements.includes(element.tagName.toUpperCase());
  }
}

/**
 * State of a carousel. The CarouselContainerElement keeps track of the state.
 */
interface CarouselState {
  // Slide to go to.
  gotoSlideNumber: number;
  // All slide elements in DOM order.
  slides: CarouselSlideElement[];
  // All slides 'scrollLeft' position. Dynamically updated when resizing.
  slidesScrollX: number[];
  // Autorotation manager, only if there are one or more autorotation buttons.
  autorotationManager: AutorotationManager | null;
  // Dynamically updated during sliding.
  slideFromNumber: number;
  slideToNumber: number;
  currentSlideNumber: number;
  closestSlideNumber: number;
  setNewSlideFocus: boolean;
}

// noinspection JSUnusedGlobalSymbols — export for user usage.
/**
 * Custom event detail of a 'slide.carousel' event.
 */
export interface SlideEventDetail {
  from: number;
  to: number;
}

/**
 * Custom event detail of a 'slid.carousel' event.
 */
export interface SlidEventDetail {
  from: number;
  to: number;
}

/**
 * Custom event detail of a 'closest.carousel' event.
 */
export interface ClosestEventDetail {
  closest: number;
}

/**
 * A Carousel has several slots (in DOM order):
 * * <default> (for content without the 'slot' attribute),
 * * previous (for the previous button),
 * * rotation (for the autorotation button),
 * * next (for the next button),
 * * before-viewport (for user content that should appear before the slides in DOM),
 * * slides (for the slides),
 * * after-viewport (for user content that should appear after the slides in DOM),
 * * navigation (for optional navigation): progress, picker or tabs.
 *
 * Slides are placed in a carousel-viewport div.
 *
 * Default slots are used when elements do not specify a specific slot and
 * are a direct child of the carousel container element.
 */
class CarouselContainerElement extends CarouselElement {
  // The carousel viewport element.
  private _carouselViewport: HTMLElement | null = null;
  private get carouselViewport(): HTMLElement {
    if (this._carouselViewport) return this._carouselViewport;
    throw new Error('No viewport for carousel');
  }
  // Internals for handling state.
  private readonly internals: ElementInternals;
  // slideQueue: [{ slide: number, x: number }], contains two or more elements while sliding.
  private slideQueue: { slide: number; x: number }[] = [];
  // State of the carousel.
  readonly carouselState: CarouselState = {
    gotoSlideNumber: 1,
    slides: [],
    slidesScrollX: [],
    autorotationManager: null,
    slideFromNumber: 0,
    slideToNumber: 0,
    currentSlideNumber: 0,
    closestSlideNumber: 0,
    setNewSlideFocus: false,
  };
  // Used in scrollEventListener to keep track of the currently closest slide.
  private closestSlideNumber: number = -1;
  // play/pause/stop/start may be called before the autorotation manager is attached.
  // Remember them here and apply when the autorotation manager is attached.
  private autorotationActions: (() => void)[] = [];

  constructor() {
    super(
      `
        :host {
          ${/* Take full width and set width to a value different from 'auto'. */ ''}
          display: block;
        }

        ${/* carousel-viewport is a direct child of the carousel-container and contains all slides. */ ''}
        .carousel-viewport {
          ${/* Take full width of parent.  */ ''}
          display: flex;
          ${/* Scroll horizontal overflow (the slides), and snap horizontally. */ ''}
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
    this.internals = this.attachInternals();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Set WCAG attributes if not set already.
    this.setAttributeIfUndefined('role', 'group');
    this.setAttributeIfUndefined('aria-roledescription', 'carousel');
    // Cache the carousel viewport because it is used often in other methods.
    this._carouselViewport = this.shadowRoot?.querySelector('.carousel-viewport') ?? null;
    // Keep track of scrolling for dispatching custom events.
    this.carouselViewport.addEventListener('scroll', this.scrollEventListener);
    // Keep track of viewport size for recalculating 'slidesScrollX'.
    this.resizeObserver.observe(this.carouselViewport);
    // Set scroll behavior of the viewport, if applicable.
    if (this.getAttribute('slide-scroll-behavior') === 'instant') {
      this.carouselViewport.style.scrollBehavior = 'auto';
    }
    // Initialize after all carousel elements have been read.
    setTimeout(() => this.initializeCarouselAfterCarouselIsLoaded(), 0);
  }

  override disconnectedCallback(): void {
    this.carouselViewport.removeEventListener('scroll', this.scrollEventListener);
    this.resizeObserver.unobserve(this.carouselViewport);
    if (this.carouselState.autorotationManager) {
      this.removeEventListener('mouseenter', this.mouseenterEventListener);
      this.removeEventListener('mouseleave', this.mouseleaveEventListener);
      this.removeEventListener('focusin', this.focusInEventListener);
      this.removeEventListener('focusout', this.focusOutEventListener);
    }
  }

  /**
   * Intent to scroll to the specified slide.
   *
   * Scrolling may be busy, which may cause the current intent to be delayed till after
   * the current scrolling has finished.
   *
   * @param slideNumber the number of the slide to scroll to, first slide is 1.
   */
  scrollToSlide(slideNumber: number): void {
    const slideQueueLength = this.slideQueue.length;
    // Don't accept queue items when the queue is too long.
    if (slideQueueLength > 2) return;
    if (slideQueueLength > 0) {
      // Append to queue, but only if valid and different from last slide in the queue.
      if (
        slideNumber < 1 ||
        slideNumber > this.carouselState.slides.length ||
        slideNumber === this.slideQueue[slideQueueLength - 1].slide
      )
        return;
      // Check direction of new scroll intent.
      const direction = this.slideQueue[slideQueueLength - 1].x - this.slideQueue[slideQueueLength - 2].x;
      const newDirection = this.carouselState.slidesScrollX[slideNumber - 1] - this.slideQueue[slideQueueLength - 1].x;
      const xorDirection = direction * newDirection;
      if (xorDirection === 0) return;
      if (xorDirection < 0) {
        // Append if the new direction differs from the last direction.
        // Scroll only allows updating the destination when the direction is the same.
        this.slideQueue.push({
          slide: slideNumber,
          x: this.carouselState.slidesScrollX[slideNumber - 1],
        });
      } else {
        // Update the destination in the queue.
        this.slideQueue[slideQueueLength - 1].slide = slideNumber;
        this.slideQueue[slideQueueLength - 1].x = this.carouselState.slidesScrollX[slideNumber - 1];
        if (slideQueueLength === 2) {
          // Scroll to the new destination if it is the current scrolling.
          this.doScrollToSlide(this.slideQueue[0].slide, slideNumber);
        }
      }
      return;
    }
    // Empty slide queue, add a new scroll.
    const fromSlide = this.carouselState.slideFromNumber || this.getCurrentSlideNumber();
    if (fromSlide === slideNumber) return;
    const fromX = this.carouselState.slidesScrollX[fromSlide - 1];
    const toX = this.carouselState.slidesScrollX[slideNumber - 1];
    this.slideQueue.push({ slide: fromSlide, x: fromX }, { slide: slideNumber, x: toX });
    this.doScrollToSlide(fromSlide, slideNumber);
  }

  /**
   * Scroll to the previous slide.
   */
  scrollToPrevious(): void {
    if (this.carouselState.currentSlideNumber <= 1) {
      this.scrollToSlide(this.carouselState.slides.length);
    } else {
      this.scrollToSlide(this.carouselState.currentSlideNumber - 1);
    }
  }

  /**
   * Scroll to the next slide.
   */
  scrollToNext(): void {
    if (this.carouselState.currentSlideNumber >= this.carouselState.slides.length) {
      this.scrollToSlide(1);
    } else {
      this.scrollToSlide(this.carouselState.currentSlideNumber + 1);
    }
  }

  // noinspection JSUnusedGlobalSymbols — API method
  /**
   * Go to a specific slide without scrolling and without 'slide' event.
   */
  gotoSlide(slideNumber: number): void {
    if (this.carouselState.currentSlideNumber) {
      //  If already initialized, go directly.
      this.gotoSlideNumber(slideNumber);
    } else {
      // If not yet initialized, specify initial slide number to go to when initializing.
      this.carouselState.gotoSlideNumber = slideNumber;
    }
  }

  // noinspection JSUnusedGlobalSymbols — API method.
  /**
   * Play autorotation programmatically.
   */
  play(): void {
    this.ifAutorotationManager(() => this.carouselState.autorotationManager?.play());
  }

  // noinspection JSUnusedGlobalSymbols — API method.
  /**
   * Pause autorotation programmatically.
   */
  pause(): void {
    this.ifAutorotationManager(() => this.carouselState.autorotationManager?.pause());
  }

  // noinspection JSUnusedGlobalSymbols — API method.
  /**
   * Stop autorotation programmatically.
   */
  stop(): void {
    this.ifAutorotationManager(() => this.carouselState.autorotationManager?.stop());
  }

  // noinspection JSUnusedGlobalSymbols — API method.
  /**
   * Start autorotation programmatically.
   */
  start(): void {
    this.ifAutorotationManager(() => this.carouselState.autorotationManager?.start());
  }

  /**
   * Execute an action either immediately if there is an autorotation manager,
   * or when the autorotation manager is attached.
   */
  private ifAutorotationManager(action: () => void) {
    if (this.carouselState.autorotationManager) {
      action();
    } else {
      this.autorotationActions.push(action);
    }
  }

  /**
   * Set autorotation attributes.
   *
   * Only called from the AutorotationManager.
   *
   * @param playing true: autorotation attributes on, false: autorotation attributes off.
   */
  autorotateAttributes(playing: boolean): void {
    if (playing) {
      this.carouselViewport.setAttribute('aria-live', 'off');
    } else {
      this.carouselViewport.setAttribute('aria-live', 'polite');
    }
  }

  private gotoSlideNumber(slideNumber: number): void {
    this.internals.states.clear();
    this.internals.states.add(`slide-${slideNumber}`);
    if (slideNumber === 1) this.internals.states.add('first');
    if (slideNumber === this.carouselState.slides.length) this.internals.states.add('last');
    const from = this.carouselState.currentSlideNumber;
    this.carouselState.currentSlideNumber = slideNumber;
    this.carouselState.closestSlideNumber = slideNumber;
    this.carouselState.gotoSlideNumber = 0;
    this.carouselViewport.scrollTo({
      left: this.carouselState.slidesScrollX[slideNumber - 1],
      top: 0,
      behavior: 'instant',
    });
    this.dispatchCustomEvent(this.createCustomEvent('slid.carousel', { from, to: slideNumber }, false));
    this.dispatchCustomEvent(this.createCustomEvent('closest.carousel', { closest: slideNumber }, false));
  }

  /**
   * Initialize the carousel after all HTML has been read.
   */
  private initializeCarouselAfterCarouselIsLoaded(): void {
    // Force this.carouselState.slidesScrollX to be calculated before going to a specific slide.
    // noinspection JSPotentiallyInvalidUsageOfThis — it is bound to 'this'.
    this.observeViewportResize();
    // Set initial state.
    if (this.carouselState.currentSlideNumber === 0) this.gotoSlideNumber(this.carouselState.gotoSlideNumber);
    this.inertNotCurrentSlides();
    // Attach AutorotationManager if there are autorotation buttons.
    this.initializeAutorotation();
    // Initialize other carousel elements.
    this.dispatchCustomEvent(this.createCustomEvent('init.carousel', {}, false));
  }

  /**
   * Initialize autorotation, must be done after all HTML has been read.
   */
  private initializeAutorotation(): void {
    const autorotationButtons = this.querySelectorAll<CarouselAutoRotationButtonElement>(
      getElementTagName('carousel-autorotation-button')
    );
    if (autorotationButtons.length > 0) {
      // Set WCAG attributes and handlers.
      this.carouselViewport.setAttribute('aria-atomic', 'false');
      // Set autorotation manager.
      this.carouselState.autorotationManager = new AutorotationManager(this, Array.from(autorotationButtons));
      // Set slide delay if applicable.
      if (this.getAttribute('slide-delay')) {
        this.carouselState.autorotationManager.setDelay(Number(this.getAttribute('slide-delay')));
      }
      // Execute actions, if any.
      this.autorotationActions.forEach((action) => action());
      // Check for cursor position and focus to pause/stop autorotation.
      this.addEventListener('mouseenter', this.mouseenterEventListener);
      this.addEventListener('mouseleave', this.mouseleaveEventListener);
      this.addEventListener('focusin', this.focusInEventListener);
      this.addEventListener('focusout', this.focusOutEventListener);
    }
  }

  /**
   * Scroll to the specified slide.
   *
   * If the specified slide does not exist, nothing will happen.
   * If the specified slide is already the current slide, nothing will happen.
   *
   * @param fromSlideNumber the number of the starting slide to scroll from, first slide is 1
   * @param toSlideNumber the number of the slide to scroll to, first slide is 1.
   */
  private doScrollToSlide(fromSlideNumber: number, toSlideNumber: number): void {
    if (
      toSlideNumber < 1 ||
      toSlideNumber > this.carouselState.slides.length ||
      toSlideNumber === this.carouselState.currentSlideNumber
    )
      return;
    // Dispatch scroll start event, when cancelled don't scroll, and cancel remaining slide queue.
    if (
      !this.dispatchCustomEvent(
        this.createCustomEvent('slide.carousel', { from: fromSlideNumber, to: toSlideNumber }, true)
      )
    ) {
      this.slideQueue = [];
      return;
    }

    // Set scrolling parameters.
    this.carouselState.setNewSlideFocus =
      this.carouselState.slides[fromSlideNumber - 1] ===
      document.activeElement?.closest(getElementTagName('carousel-slide'));
    this.carouselState.slideFromNumber = fromSlideNumber;
    this.carouselState.slideToNumber = toSlideNumber;
    // Perform the scroll.
    this.carouselViewport.scrollTo(this.carouselState.slidesScrollX[toSlideNumber - 1], 0);
  }

  /**
   * Scroll event listener: after scrolling to a new slide, set new state and fire the 'slid' event.
   */
  private scrollEventListener = function (this: CarouselContainerElement): void {
    // Set closest picker button, but only if different from the previous closest.
    const closest = this.getClosestSlideNumber();
    if (closest !== this.closestSlideNumber) {
      this.dispatchCustomEvent<ClosestEventDetail>(
        this.createCustomEvent<ClosestEventDetail>('closest.carousel', { closest: this.getClosestSlideNumber() }, false)
      );
      this.closestSlideNumber = this.getClosestSlideNumber();
    }
    const currentSlide = this.getCurrentSlideNumber();
    // Check if scrolling is finished: it is the destination, or there is no destination.
    if (currentSlide !== 0 && [currentSlide, 0].includes(this.carouselState.slideToNumber)) {
      // Prepare the parameter for 'slid' event.
      const slidEventDetail = {
        from: this.carouselState.slideFromNumber,
        to: this.carouselState.slideToNumber || currentSlide,
      };
      // Update carousel state.
      this.carouselState.currentSlideNumber = currentSlide;
      this.carouselState.slideFromNumber = 0;
      this.carouselState.slideToNumber = 0;
      this.internals.states.clear();
      this.internals.states.add(`slide-${currentSlide}`);
      if (currentSlide === 1) this.internals.states.add('first');
      if (currentSlide === this.carouselState.slides.length) this.internals.states.add('last');
      // Inert unavailable slides.
      this.inertNotCurrentSlides();
      // Set focus if applicable.
      if (this.carouselState.setNewSlideFocus) {
        this.carouselState.slides[currentSlide - 1].querySelector<HTMLElement>('[slide-autofocus]')?.focus();
        this.carouselState.setNewSlideFocus = false;
      }
      // Fire 'slid' event.
      this.dispatchCustomEvent(this.createCustomEvent('slid.carousel', slidEventDetail, false));
      // Check and update slide queue.
      this.slideQueue = this.slideQueue.slice(1);
      if (this.slideQueue.length <= 1) {
        // Ready scrolling.
        this.slideQueue = [];
      } else {
        // Apply next scroll.
        this.doScrollToSlide(this.slideQueue[0].slide, this.slideQueue[1].slide);
      }
    }
  }.bind(this);

  /**
   * Mouseover/mouseleave/focusin/focusout event listeners: to pause and start autorotation.
   */
  private mouseenterEventListener = function (this: CarouselContainerElement): void {
    this.carouselState.autorotationManager?.onMouseenter();
  }.bind(this);

  private mouseleaveEventListener = function (this: CarouselContainerElement): void {
    this.carouselState.autorotationManager?.onMouseleave();
  }.bind(this);

  private focusInEventListener = function (this: CarouselContainerElement, event: FocusEvent): void {
    this.carouselState.autorotationManager?.onFocus(event);
  }.bind(this);

  private focusOutEventListener = function (this: CarouselContainerElement, event: FocusEvent): void {
    this.carouselState.autorotationManager?.onBlur(event);
  }.bind(this);

  /**
   * ResizeObserver for observing the width of the carousel viewport. When it changes, recalculate 'slidesScrollX'.
   */
  private observeViewportResize = function (this: CarouselContainerElement): void {
    this.carouselState.slidesScrollX = [];
    const viewportWidth = this.carouselViewport.getBoundingClientRect().width;
    this.carouselState.slides.forEach((slide: any, index: any) => {
      this.carouselState.slidesScrollX.push(
        this.carouselState.slides
          .slice(0, index)
          .reduce((acc: any, slide: any) => acc + slide.getBoundingClientRect().width, 0) -
          (viewportWidth - slide.getBoundingClientRect().width) / 2
      );
    });
  }.bind(this);

  private resizeObserver = new ResizeObserver(this.observeViewportResize);

  /**
   * Dispatch the given event on the carousel container.
   *
   * @param event the Event to dispatch.
   */
  private dispatchCustomEvent<T>(event: CustomEvent<T>): boolean {
    return this.dispatchEvent(event);
  }

  /**
   * Create a new CustomEvent that will propagate across the shadow boundary.
   *
   * @param eventName the name of the event.
   * @param detail the detail data of the event.
   * @param cancelable true if cancelable, false if not.
   */
  private createCustomEvent<T>(eventName: string, detail: T, cancelable: boolean): CustomEvent<T> {
    return new CustomEvent<T>(eventName, { cancelable, composed: true, detail });
  }

  /**
   * Return the current slide number, or 0 when it could not be determined (because it is busy scrolling).
   */
  private getCurrentSlideNumber(): number {
    return (
      this.carouselState.slidesScrollX.findIndex((x: any) => {
        return Math.abs(this.carouselViewport.scrollLeft - x) < 1;
      }) + 1
    );
  }

  /**
   * Return the closest slide.
   */
  private getClosestSlideNumber(): number {
    const x = this.carouselViewport.scrollLeft;
    return (
      this.carouselState.slidesScrollX.reduce((p: any, c: any, i: any, a: any) => {
        return Math.abs(a[p] - x) < Math.abs(c - x) ? p : i;
      }) + 1
    );
  }

  /**
   * Activate the current slide and inert all others.
   */
  private inertNotCurrentSlides(): void {
    this.carouselState.slides.forEach((slide: any) => {
      if (slide.slideState.slideNum === this.carouselState.currentSlideNumber) {
        this.activateSlide(slide);
      } else {
        this.inertSlide(slide);
      }
    });
  }

  /**
   * Add the 'inert' attribute to the specified slide Element.
   *
   * @param slide the slide Element to add the 'inert' attribute to.
   */
  private inertSlide(slide: CarouselSlideElement): void {
    slide.setAttribute('inert', '');
  }

  /**
   * Remove the 'inert' attribute from the specified slide Element.
   *
   * @param slide the slide Element to remove the 'inert' attribute from.
   */
  private activateSlide(slide: CarouselSlideElement): void {
    slide.removeAttribute('inert');
  }
}
defineCustomElementWithDataIdPrefix('carousel-container', CarouselContainerElement);

/**
 * A slide for the carousel. Automatically uses the 'slides' slot.
 */
class CarouselSlideElement extends CarouselElement {
  readonly slideState: { readonly slideNum: number };

  constructor() {
    super(
      `
        :host {
          ${/* Allow absolute positioning inside the slide, used for the snapper. */ ''}
          position: relative;
          ${/* The slide will not grow nor shrink and take 100% of its parents' width. */ ''}
          flex: 0 0 100%;
          width: 100%;
        }

        ${/* For scroll snapping, the carousel-snapper sits at the top of the slide and has height 0. */ ''}
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

  override connectedCallback(): void {
    super.connectedCallback();
    // Set WCAG attributes.
    // Attributes are for carousel usage without tablist/tabs. Tab element may overwrite these.
    this.setAttributeIfUndefined('role', 'group');
    this.setAttributeIfUndefined('aria-roledescription', 'slide');
  }
}
defineCustomElementWithDataIdPrefix('carousel-slide', CarouselSlideElement);

/**
 * A carousel slide button that scrolls to a specific slide.
 */
// noinspection JSPotentiallyInvalidConstructorUsage — 'HTMLRoleButtonElement(CarouselElement)' is a valid call.
class CarouselButtonElement extends HTMLRoleButtonElement(CarouselElement) {
  // The slide to go to.
  protected slideNumber = Number(this.getAttribute('slide'));
  // The carousel container.
  private carouselContainer = this.getParentCarouselContainer();
  // Internals for handling state.
  protected internals;

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Simple cast for new. See: https://github.com/microsoft/TypeScript/issues/28357
    this.carouselContainer.addEventListener('slid.carousel', this.slidEventListener as EventListener);
  }

  override disconnectedCallback(): void {
    this.carouselContainer.removeEventListener('slid.carousel', this.slidEventListener as EventListener);
    super.disconnectedCallback();
  }

  override clicked(): void {
    this.carouselContainer.scrollToSlide(this.slideNumber);
  }

  private slidEventListener = function (this: CarouselButtonElement, event: CustomEvent<SlidEventDetail>): void {
    // Set the current state on the button if it is a button to go to the current slide.
    if (event.detail.to === this.slideNumber) {
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
 * * style: absolute positioning, full height, 15% width and positioned at top 0,
 * * role: button,
 */
// noinspection JSPotentiallyInvalidConstructorUsage — 'HTMLRoleButtonElement(CarouselElement)' is a valid call.
class CarouselPreviousNextButtonElement extends HTMLRoleButtonElement(CarouselElement) {
  /**
   * @param style the extra styling for the button element (defaults to '').
   * @param slot the slot name when placed inside another custom element (defaults to none).
   */
  constructor(style: string, slot: string) {
    super(
      `
        :host {
          ${/* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''}
          ${/* This way the user can position the button everywhere, inside or outside the carousel. */ ''}
          position: absolute;
          top: 0;
          width: 15%;
          height: 100%;
        }

        ${style ?? ''}
      `,
      undefined,
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

  override clicked(): void {
    this.getParentCarouselContainer().scrollToPrevious();
  }
}
defineCustomElementWithDataIdPrefix('carousel-previous-button', CarouselPreviousSlideButtonElement);

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

  override clicked(): void {
    this.getParentCarouselContainer().scrollToNext();
  }
}
defineCustomElementWithDataIdPrefix('carousel-next-button', CarouselNextSlideButtonElement);

// The possible autorotation states.
const PLAYING = 'playing';
const PAUSING = 'pausing';
const STOPPED = 'stopped';
const STARTING = 'starting';

// States as a type.
const playStates = [PLAYING, PAUSING, STOPPED, STARTING] as const;
type PlayState = (typeof playStates)[number];

/**
 * Manages all autorotation.
 *
 * All autorotation buttons in the carousel should have the same state. The manager manages this.
 *
 * The initial state is: playing.
 *
 * Moving the mouse in or out of the carousel changes state:
 * * pausing → playing: when the mouse leaves the carousel,
 * * playing → pausing: when mouse enters the carousel,
 *
 * Moving the focus in or out of the carousel changes state:
 * * playing → stopped: when the focus enters the carousel.
 * * pausing → stopped: when the focus enters the carousel.
 * * starting → playing: when the focus leaves the carousel and the mouse is not inside the carousel.
 * * starting → pausing: when the focus leaves the carousel and the mouse is inside the carousel.
 *
 * Clicking an autorotation button switches state:
 * * playing → stopped,
 * * pausing → stopped,
 * * starting → stopped,
 * * stopped → starting (only when the click did not cause a focus, switches to playing when the focus leaves the carousel),
 *
 * Focus in occurs on mouse down, click occurs on mouse up. We do not want a mouse click to cause a:
 * * focus (causing the carousel to stop) and a
 * * click (causing the carousel to start).
 * therefore we keep track of ignoreClickAfterFocus so that a click causing focus does not immediately restart the carousel.
 */
class AutorotationManager {
  // The delay between auto-rotating slides in ms.
  private delayBetweenSlidesMs = 3000;
  // The timeout handle for autorotation.
  private timeoutHandle: any = null;
  // The current state of the button: playing, pausing or stopped.
  private playState: PlayState = STOPPED;
  // The current state of the hover.
  private hovered = false;
  // When a focus will cause a click because the element was focused by the mouse button.
  private ignoreClickAfterFocus = false;

  /**
   * @param carouselContainer The carousel container that contains the autorotation manager.
   * @param buttons All autorotation button elements.
   */
  constructor(
    private readonly carouselContainer: CarouselContainerElement,
    private readonly buttons: CarouselAutoRotationButtonElement[]
  ) {
    this.play();
  }

  /**
   * Set delay between slides in ms.
   */
  setDelay(ms: any): void {
    this.delayBetweenSlidesMs = ms;
    // Force the new timeout value to be used.
    this.setState(this.playState);
  }

  /**
   * State change on clicking an autorotation button.
   */
  onClick(): void {
    switch (this.playState) {
      case PLAYING:
      case PAUSING:
      case STARTING:
        this.stop();
        break;
      case STOPPED:
        if (!this.ignoreClickAfterFocus) {
          this.start();
        }
        this.ignoreClickAfterFocus = false;
        break;
    }
  }

  /**
   * State change on mouse hovering any element of the carousel.
   */
  onMouseenter(): void {
    this.ignoreClickAfterFocus = false;
    this.hovered = true;
    if (this.playState === PLAYING) {
      this.pause();
    }
  }

  /**
   * State change on mouse leaving the carousel.
   */
  onMouseleave(): void {
    this.ignoreClickAfterFocus = false;
    this.hovered = false;
    if (this.playState === PAUSING) {
      this.play();
    }
  }

  /**
   * State change on focusing any element of the carousel.
   */
  onFocus(event: FocusEvent): void {
    this.ignoreClickAfterFocus = false;
    // Only change focus when previously not inside the carousel and now inside the carousel.
    const from = (event.relatedTarget as HTMLElement | null)?.closest(getElementTagName('carousel-container'));
    const to = (event.target as HTMLElement | null)?.closest(getElementTagName('carousel-container'));
    if (from !== to && to === this.carouselContainer) {
      // Ignore a click after focus only when the carousel was not already stopped.
      // Focus by mousedown causes the carousel to stop, click on subsequent mouseup would cause it to start,
      // but we don't want that. Hence, when stopped we want to ignore the next immediate click.
      this.ignoreClickAfterFocus = this.playState !== STOPPED;
      this.stop();
    }
  }

  /**
   * State change on blurring the carousel.
   */
  onBlur(event: FocusEvent): void {
    this.ignoreClickAfterFocus = false;
    // Only change focus when previously inside the carousel and now not inside the carousel.
    const from = (event.target as HTMLElement | null)?.closest(getElementTagName('carousel-container'));
    const to = (event.relatedTarget as HTMLElement | null)?.closest(getElementTagName('carousel-container'));
    if (from !== to && from === this.carouselContainer) {
      if (this.playState === STARTING) {
        if (this.hovered) {
          this.pause();
        } else {
          this.play();
        }
      }
    }
  }

  play(): void {
    this.setState(PLAYING);
  }

  pause(): void {
    this.setState(PAUSING);
  }

  stop(): void {
    this.setState(STOPPED);
  }

  start(): void {
    this.setState(STARTING);
  }

  /**
   * Set specified state and restart timeout handler.
   */
  private setState(state: PlayState): void {
    this.buttons.forEach((b) => b.setState(state));
    this.playState = state;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    this.timeoutHandle = setTimeout(this.onTimeout, this.delayBetweenSlidesMs);
    this.carouselContainer.autorotateAttributes(this.playState === PLAYING);
  }

  /**
   * Timeout handler: slide to next slide when playing.
   */
  private onTimeout = function (this: AutorotationManager): void {
    if (this.playState === PLAYING) {
      this.carouselContainer.scrollToNext();
      this.timeoutHandle = setTimeout(this.onTimeout, this.delayBetweenSlidesMs);
    }
  }.bind(this);
}

/**
 * The autorotation button.
 *
 * It is a custom element that gets:
 * * style: absolute positioning, full height, 70% width and positioned at top 0, centered,
 * * role: button,
 */
// noinspection JSPotentiallyInvalidConstructorUsage - 'HTMLRoleButtonElement(CarouselElement)' is a valid call.
class CarouselAutoRotationButtonElement extends HTMLRoleButtonElement(CarouselElement) {
  // Internals for handling state.
  private internals;

  constructor() {
    super(
      `
          :host {
            ${/* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''}
            ${/* This way the user can position the button everywhere, inside or outside the carousel. */ ''}
            position: absolute;
            top: 0;
            left: auto;
            right: auto;
            width: 70%;
            height: 20%;
          }
        `,
      undefined,
      'rotation'
    );
    this.internals = this.attachInternals();
  }

  override clicked() {
    this.getParentCarouselContainer().carouselState.autorotationManager?.onClick();
  }

  setState(state: PlayState) {
    this.internals.states.clear();
    this.internals.states.add(state);
  }
}
defineCustomElementWithDataIdPrefix('carousel-autorotation-button', CarouselAutoRotationButtonElement);

/**
 * The picker navigation element for the carousel, contains picker buttons.
 */
class CarouselPickerElement extends CarouselElement {
  constructor() {
    super(
      `
          :host {
            ${/* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''}
            ${/* This way the user can position the picker element everywhere, inside or outside the carousel. */ ''}
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
  override connectedCallback(): void {
    super.connectedCallback();
    this.getParentCarouselContainer().addEventListener('closest.carousel', this.closestEventListener as EventListener);
  }

  override disconnectedCallback(): void {
    this.getParentCarouselContainer().removeEventListener(
      'closest.carousel',
      this.closestEventListener as EventListener
    );
    super.disconnectedCallback();
  }

  private closestEventListener = function (
    this: CarouselPickerButtonElement,
    event: CustomEvent<ClosestEventDetail>
  ): void {
    if (this.slideNumber === event.detail.closest) {
      this.internals.states.add('closest');
    } else {
      this.internals.states.delete('closest');
    }
  }.bind(this);
}
defineCustomElementWithDataIdPrefix('carousel-picker-button', CarouselPickerButtonElement);

/**
 * The progress element for the carousel, contains progress items.
 */
class CarouselProgressElement extends CarouselElement {
  constructor() {
    super(
      `
          :host {
            ${/* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''}
            ${/* This way the user can position the progress element everywhere, inside or outside the carousel. */ ''}
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
defineCustomElementWithDataIdPrefix('carousel-progress', CarouselProgressElement);

/**
 * A carousel progress item, indicates progress in the carousel.
 */
class CarouselProgressItemElement extends CarouselElement {
  // The slide to go to.
  protected slideNumber: number = Number(this.getAttribute('slide'));
  // The carousel container.
  protected carouselContainer: CarouselContainerElement = this.getParentCarouselContainer();
  // Internals for handling state.
  private internals;

  constructor() {
    super();
    this.internals = this.attachInternals();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.carouselContainer.addEventListener('slid.carousel', this.#slidEventListener as EventListener);
    this.carouselContainer.addEventListener('closest.carousel', this.#closestEventListener as EventListener);
  }

  override disconnectedCallback(): void {
    this.carouselContainer.removeEventListener('closest.carousel', this.#closestEventListener as EventListener);
    this.carouselContainer.removeEventListener('slid.carousel', this.#slidEventListener as EventListener);
  }

  #slidEventListener = function (this: CarouselProgressItemElement, event: CustomEvent<SlidEventDetail>): void {
    // Set the current state on the progress item if it is an item showing the current slide progress.
    if (event.detail.to === this.slideNumber) {
      this.internals.states.add('current');
    } else {
      this.internals.states.delete('current');
    }
  }.bind(this);

  #closestEventListener = function (this: CarouselProgressItemElement, event: CustomEvent<ClosestEventDetail>): void {
    if (this.slideNumber === event.detail.closest) {
      this.internals.states.add('closest');
    } else {
      this.internals.states.delete('closest');
    }
  }.bind(this);
}
defineCustomElementWithDataIdPrefix('carousel-progress-item', CarouselProgressItemElement);

/**
 * The tab list navigation element for the carousel, contains tab elements.
 */
class CarouselTabListElement extends CarouselElement {
  // The carousel container.
  private carouselContainer = this.getParentCarouselContainer();
  // All tabs inside this tablist in DOM order.
  private tabs: CarouselTabElement[] = [];

  constructor() {
    super(
      `
          :host {
            ${/* First relative parent is outside the carousel, hence should be taken care of by the user. */ ''}
            ${/* This way the user can position the tabs element everywhere, inside or outside the carousel. */ ''}
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

  override connectedCallback(): void {
    super.connectedCallback();
    // Set WCAG attributes.
    this.setAttributeIfUndefined('role', 'tablist');
    this.carouselContainer.addEventListener('init.carousel', this.initEventListener);
    this.addEventListener('keydown', this.keydownEventListener);
  }

  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.keydownEventListener);
    this.carouselContainer.removeEventListener('init.carousel', this.initEventListener);
  }

  private initEventListener = function (this: CarouselTabListElement): void {
    this.tabs = Array.from(this.querySelectorAll(getElementTagName('carousel-tab')));
  }.bind(this);

  private keydownEventListener = function (this: CarouselTabListElement, event: KeyboardEvent): void {
    // Get the tab that currently has focus. Only one tab can have focus.
    // It must have focus, otherwise the keydown would not fire, and the tablist itself cannot have focus.
    const activeTabNum = this.tabs.findIndex((t) => t.getAttribute('tabindex') === '0');
    switch (event.key) {
      case 'End':
        this.activateTab(activeTabNum, this.tabs.length - 1);
        event.preventDefault();
        break;
      case 'Home':
        this.activateTab(activeTabNum, 0);
        event.preventDefault();
        break;
      case 'ArrowLeft':
        this.activateTab(activeTabNum, (activeTabNum + this.tabs.length - 1) % this.tabs.length);
        event.preventDefault();
        break;
      case 'ArrowRight':
        this.activateTab(activeTabNum, (activeTabNum + 1) % this.tabs.length);
        event.preventDefault();
        break;
    }
  }.bind(this);

  private activateTab(inactiveTabNum: number, activeTabNum: number) {
    if (inactiveTabNum === activeTabNum) return;
    const inactiveTab = this.tabs[inactiveTabNum];
    const activeTab = this.tabs[activeTabNum];
    // Update WCAG and tabindex, and set focus.
    activeTab.setAttribute('aria-selected', 'true');
    activeTab.setAttribute('tabindex', '0');
    activeTab.focus();
    inactiveTab.setAttribute('aria-selected', 'false');
    inactiveTab.setAttribute('tabindex', '-1');
    // Slides on tabs may be different from sequential slides order, hence get slide number to go to from the tab.
    this.carouselContainer.scrollToSlide(Number(activeTab.getAttribute('slide')));
  }
}
defineCustomElementWithDataIdPrefix('carousel-tab-list', CarouselTabListElement);

/**
 * The tab navigation element for the carousel, must be used inside a tab list.
 */
class CarouselTabElement extends CarouselProgressItemElement {
  constructor() {
    super();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.carouselContainer.addEventListener('init.carousel', this.initEventListener);
    this.carouselContainer.addEventListener('slid.carousel', this.slidEventListener);
    this.addEventListener('click', this.clickListener);
    // Set WCAG attributes.
    this.setAttributeIfUndefined('role', 'tab');
  }

  override disconnectedCallback(): void {
    this.removeEventListener('click', this.clickListener);
    this.carouselContainer.removeEventListener('slid.carousel', this.slidEventListener);
    this.carouselContainer.removeEventListener('init.carousel', this.initEventListener);
    super.disconnectedCallback();
  }

  private initEventListener = function (this: CarouselTabElement): void {
    const slide = this.carouselContainer.carouselState.slides[this.slideNumber - 1];
    const slideId = this.getSlideId(slide);
    // Set WCAG attributes.
    this.setAttribute('aria-controls', slideId);
    // Override default slide WCAG attributes.
    slide.setAttribute('role', 'tabpanel');
    slide.removeAttribute('aria-roledescription');
  }.bind(this);

  private slidEventListener = function (this: CarouselTabElement, event: any) {
    // Update WCAG attributes and tabindex when arriving at, or leaving a tab.
    // Needed when another navigation control navigates, or autorotation changes the current slide.
    if (event.detail.to === this.slideNumber) {
      this.setAttribute('aria-selected', 'true');
      this.setAttribute('tabindex', '0');
    } else {
      this.setAttribute('aria-selected', 'false');
      this.setAttribute('tabindex', '-1');
    }
  }.bind(this);

  private clickListener = function (this: CarouselTabElement) {
    // Tab clicked, scroll to the corresponding slide.
    this.carouselContainer.scrollToSlide(this.slideNumber);
  }.bind(this);

  /**
   * Get slide ID, set if not already set.
   */
  private getSlideId(slide: CarouselSlideElement) {
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
