# Carousel

A carousel implementation that follows: https://www.w3.org/WAI/ARIA/apg/patterns/carousel/

## Usage

The carousel is a set of custom HTML elements that uses shadow DOM to define structure and style.

It aims to be WCAG compatible as good as possible. Part of the WCAG compatibility is implemented
inside the carousel elements, part has to be specified in the custom HTML tags by the user.
See https://www.w3.org/WAI/ARIA/apg/patterns/carousel/ and the examples on how to implement that part.

### Loading the javascript

The carousel is loaded by loading a javascript file (the name is not important) at the end of the body:

`<script type="module" src="main.ts"></script>`

that contains:

```typescript
import '@pukanito/carousel';
```

When loaded, every carousel sends an initial slid event for sliding to slide number 1
(by default, it might be changed by calling `gotoSlide(num)` during initialization of the page. Load
the javascript at the end of the body because otherwise listeners may not receive
the initial 'slid' event. Only listeners defined before loading the javascript will
receive the initial 'slid' event.

## Tags

### &lt;carousel-container>

The container for all other carousel elements.

By default the carousel container has `role="group"`, and `aria-roledescription="carousel"`.
Set `role="region"` explicitly when applicable: `<carousel-container role="region">...`

The carousel container contains a viewport div that contains all slides.
When a `<carousel-autorotation-button>` is present it will set attributes
'aria-atomic': 'false', and 'aria-live' set to 'off' or 'polite' (depending on
whether the carousel auto-rotates or not) on the viewport div.

The carousel container dispatches the `init.carousel`, `slide.carousel` and `slid.carousel` events.

The carousel container handles pointer and focus events on the carousel.

The carousel container adds the 'inert' attribute to all slides that are not the current slide.
This causes all interaction with the hidden slides to be stopped and only the active slide
has interaction. Be aware that inert slides and contents cannot be referenced by `aria-labelledby`!

The carousel container has states depending on which slide is the current.
This state can be used in CSS with the ':state' pseudo-class:

- 'first': active when the first slide is the current slide,
- 'last': active when the last slide is the current slide,
- 'slide-N': where 'N' is a number starting at 1, when slide N is the current slide.

By default scrolling is smooth, but can be set to instant by adding `slide-scroll-behavior="instant"`
to the carousel container tag:

```html
<carousel-containter slide-scroll-behavior="instant" ...>...</carousel-containter>
```

Any value other than 'instant' will set scrolling behavior to smooth.

#### Slots

The carousel container has several slots that are used by the other carousel elements
(if no slot is explicitly specified on them, and they are a direct child of the carousel container).
Placing a child element in a specific slot (automatically or explicitly) specifies the DOM order
of the elements (and hence the tab sequence order).

```html
<slot></slot>
<slot
  name="previous"></slot>
<slot
  name="rotation"></slot>
<slot
  name="next"></slot>
<slot
  name="before-viewport"></slot>
<div
  class="carousel-viewport">
  <slot name="slides"></slot>
</div>
<slot
  name="after-viewport"></slot>
<slot
  name="navigation"></slot>
```

By default, other carousel elements use the following slot (when they are a direct child of the carousel container):

| slot                 | element                                                           |
|----------------------|-------------------------------------------------------------------|
| &lt;default slot&gt; | all other child elements                                          |
| previous             | `<carousel-previous-button>`                                      |
| rotation             | `<carousel-autorotation-button>`                                  |
| next                 | `<carousel-next-button>`                                          |
| before-viewport      |                                                                   |
| slides               | `<carousel-slide>`                                                |
| after-viewport       |                                                                   |
| navigation           | `<carousel-picker>`, `<carousel-progress>`, `<carousel-tab-list>` |

All other content inside the carousel container will be placed inside the default `<slot>` at the top.
The default can be overridden by specifying the `slot` attribute in a carousel element.
The `before-viewport` and `after-viewport` slots can be used to place child elements explicitly before
or after the slides in the DOM.

#### Starting at a specific slide

By default the carousel container will start showing slides at slide number 1. This can be
changed by applying javascript just after loading the carousel sources:

```html
  <script type="module" src="main.js"></script>
  <script>
    // Start at a slide different from the first.
    // Need to wait for 'DOMContentLoaded' because the carousel script is loaded deferred.
    window.addEventListener('DOMContentLoaded', function () {
      document.querySelector('carousel-container').gotoSlide(3);
    });
  </script>
```

### &lt;carousel-slide>

A slide containing content to show inside the carousel when it is active.

Slides automatically get a number in the carousel, starting at 1. Carousel navigation elements can then
refer to a specific slide by its assigned number.

Every slide has `position: relative` which is used internally for snapping the slide into place, but also
makes it easy to position other elements 'absolute' inside a slide.

When a slide is not active, it gets the `inert` attribute to remove it from DOM. This also has consequences
for `aria-labelledby`, that cannot refer to an inert slide. Hence, `<carousel-picker-button>` and
`<carousel-tab>` cannot use `aria-labelledby` to refer to a slide name because the slide may be inert.
Always use `aria-label` to name these elements or rely on the inner text.

Elements inside slides can have the `slide-autofocus` attribute. When focus is inside a slide and scrolling
starts, the slide will loose focus because it becomes inert. In that case the first element
inside the destination slide that has the `slide-autofocus` attribute will be focused when scrolling finishes.

### &lt;carousel-previous-button>

An element with `role="button"` that scrolls to the previous slide when activated.
When the first slide is active, it scrolls to the last slide.

It has, by default:

```css
carousel-previous-button {
  position: absolute;
  top: 0;
  width: 15%;
  height: 100%;
  left: 0;
}
```

which places it, by default, at the left side of a `position: relative` parent container.

### &lt;carousel-next-button>

An element with `role="button"` that scrolls to the next slide when activated.
When the last slide is active, it scrolls to the first slide.

It has, by default:

```css
carousel-previous-button {
  position: absolute;
  top: 0;
  width: 15%;
  height: 100%;
  right: 0;
}
```

which places it, by default, at the right side of a `position: relative` parent container.

### &lt;carousel-autorotation-button>

An element with `role="button"` that controls the autorotation state.
When there is no `<carousel-autorotation-button>`, the carousel will not have autorotation functionality.
When there is more than one `<carousel-autorotation-button>`, they will all control the same autorotation.

By default is shows each slide for 3000 milliseconds. This can be changed by setting the `slide-delay`
attribute on de `<carousel-container>` that contains the autorotation button (where slide-delay
is in milliseconds):

```html
<carousel-containter slide-delay="5000" ...>...</carousel-containter>
```

It has, by default:

```css
carousel-previous-button {
  position: absolute;
  top: 0;
  left: auto;
  right: auto;
  width: 70%;
  height: 20%;
}
```

which places it, by default, centered at the top of a `position: relative` parent container.

#### States

The `<carousel-autorotation-button>` has four states:
- playing,
- pausing,
- stopped,
- starting

These states can be used in CSS with the ':state' pseudo-class.

Initially it has the `playing` state, which causes the slides to auto rotate. Activating the button, or
clicking or hovering the carousel will change its state.

When the state is `playing` and any element of the carousel is hovered, the state will change to `pausing`.
When the pointer leaves the carousel elements it will return back to `playing`.

When the state is `playing` and any element of the carousel gets focus, the state will change to `stopped`.
When the carousel has no focus and the `<carousel-autorotation-button>` is activated state will change as follows:
- `playing` &rarr; `pausing`, because the pointer hovers the `<carousel-autorotation-button>`.
- `pausing` &rarr; `stopped`, when the button is activated.

When the state is `stopped` and the `<carousel-autorotation-button>` is activated, the state will change to `starting`.
In this state the autorotation will start as soon as the focus leaves the carousel, which will also cause
the state to change to `playing`.

When the state is `starting` and the `<carousel-autorotation-button>` is activated, the state will change to `stopped`.

The text on the button should be accessible by a screen reader. For example:

```html
<demo-carousel-autorotation-button>
  <div class="playing">
    <p><strong>Stop slide rotation</strong></p>
  </div>
  <div class="pausing">
    <p><strong>Paused...</strong></p>
  </div>
  <div class="stopped">
    <p><strong>Start slide rotation</strong></p>
  </div>
  <div class="starting">
    <p><strong>Starting...</strong></p>
  </div>
</demo-carousel-autorotation-button>
```

```css
demo-carousel-autorotation-button {
  div.playing,
  div.pausing,
  div.stopped,
  div.starting {
    display: none;
  }

  &:state(playing) {
    div.playing {
      display: block;
    }
  }

  &:state(pausing) {
    div.pausing {
      display: block;
    }
  }

  &:state(starting) {
    div.starting {
      display: block;
    }
  }

  &:state(stopped) {
    div.stopped {
      display: block;
    }
  }
}
```

This will cause the button to have inner text depending on its state.

### &lt;carousel-progress> and &lt;carousel-progress-item>

Non interactive elements that show the position of the current slide related to all slides.
`<carousel-progress>` is a container for one or more `<carousel-progress-item>`.

`<carousel-progress-item slide="<N>">` specifies to which slide it refers.
`slide` contains the slide number, starting at 1.

It has, by default:

```css
carousel-progress {
  position: absolute;
  right: auto;
  top: 0;
  left: auto;
}
```

which places it, by default, centered at the top of a `position: relative` parent container.

Normally there is a `<carousel-progress-item>` for each slide.

`<carousel-progress-item>` has two states:
- current: active when the current slide is represented by this progress item,
- closest: active when the slide showing in the viewport is represented by this progress item,
  both when a slide is active and when the viewport is scrolling.

See examples for more information and how to use the states.

### &lt;carousel-picker> and &lt;carousel-picker-button>

Container and buttons to select a specific slide using buttons.
`<carousel-picker>` is a container for one or more `<carousel-picker-button>`.

`<carousel-picker-button slide="<N>">` specifies to which slide it refers.
`slide` contains the slide number, starting at 1.

It has, by default:

```css
carousel-picker {
  position: absolute;
  right: auto;
  top: 0;
  left: auto;
}
```

which places it, by default, centered at the top of a `position: relative` parent container.

Normally there is a `<carousel-picker-button>` for each slide.

`<carousel-picker-button>` has two states:
- current: active when the current slide is represented by this picker button,
- closest: active when the slide showing in the viewport is represented by this picker-button,
  both when a slide is active and when the viewport is scrolling.

See examples for more information and how to use the states.

### &lt;carousel-tabs> and &lt;carousel-tab>

Container and tabs to select a specific slide using a tabs pattern.
`<carousel-tabs>` is a container for one or more `<carousel-tab>`.

`<carousel-tab slide="<N>">` specifies to which slide it refers.
`slide` contains the slide number, starting at 1.

Normally there is a `<carousel-tab>` for each slide containing.

`<carousel-tab>` has two states:
- current: active when the current slide is represented by this picker button,
- closest: active when the slide showing in the viewport is represented by this picker-button,
  both when a slide is active and when the viewport is scrolling.

See examples for more information and how to use the states.

Every slide that has a tab gets a `role="tabpanel"` instead of `role="group"`, and no longer
has a `aria-roledescription="slide"`.

Every slide that has a tab gets an 'id' if not already present and the corresponding
tab gets a `aria-controls="<id of the slide>"`.

When a tab is active, it gets `aria-selected="true"` and `tabindex="0"`. All
inactive tabs have `aria-selected="false"` and `tabindex="-1"`.

### &lt;carousel-button>

A button that can be placed anywhere inside a carousel container and when activated will scroll to
a specific slide.

`<carousel-button slide="<N>">` specifies to which slide it refers.
`slide` contains the slide number, starting at 1.

`<carousel-button>` has one state:
- current: active when the current slide is represented by this button,

## Events

### init.carousel

Dispatched once, when all elements are in the DOM.

### slide.carousel

The `slide.carousel` event is dispatched just before sliding to a new slide starts.
It can be cancelled, using `preventDefault()`, causing the sliding to be aborted.

The event detail contains `{ from: number, to: number }`, which indicates the current slide
and the slide it will slide to.

### slid.carousel

The `slid.carousel` event is dispatched just after the destination slide is reached.

The event detail contains `{ from: number, to: number }`, which indicates the previous slide
and the current slide.

### closest.carousel

The `closest.carousel` event is dispatched several times during sliding.

The event detail contains `{ closest: number }`, which indicates the slide
that is currently in the viewport.

## Styling and slots

The following elements have a default styling and slot applied only if they are a direct
child of the `<carousel-container>`:

- carousel-previous-button
- carousel-next-button
- carousel-autorotation-button
- carousel-picker
- carousel-progress
- carousel-tab-list

When not a direct child of the `<carousel-container>`, they will have the same
styling as a `<div>` and will be placed in the same slot as their direct parent element.
When no slot is specified, this will be the default slot.

## API

The carousel container has several methods that can be called by the user to
affect the carousel. These methods have to be called on the carousel container
element, for example:

```typescript
document.querySelector('carousel-container').scrollToSlide(3);
```

### scrollToSlide

`scrollToSlide(slideNumber: number): void` scrolls to the specified slide number (starting
at 1 for the first slide).

### scrollToPrevious

`scrollToPrevious(): void` scrolls to the previous slide, or the last slide if the
current slide is the first slide.

### scrollToNext

`scrollToNext(): void` scrolls to the next slide, or the first slide if the 
current slide is the last slide.

### gotoSlide

`gotoSlide(slideNumber: number): void` moves instantly (without scrolling animation)
to the specified slide.

### play

`play(): void` plays autorotation (if there are one or more autorotation buttons),
autorotation will play immediately.

### pause

`pauses(): void` pauses autorotation (if there are one or more autorotation buttons).

### stop

`stop(): void` stops autorotation (if there are one or more autorotation buttons).

### start

`start(): void` starts autorotation (if there are one or more autorotation buttons),
autorotation will play when the focus leaves the carousel. If the focus is not inside
the carousel, then it will stop when the focus enters the carousel.

# NX - Carousel

This library was generated with [Nx](https://nx.dev).

## Building

Run `nx build carousel` to build the library.

## Running unit tests

Run `nx test carousel` to execute the unit tests via [Jest](https://jestjs.io).

## Publishing

- update the version number in 'package.json' of 'carousel',
- build the new version,
- `cd` to the dist directory of carousel,
- `npm adduser` to login in npm,
- `npm publish --access=public` to publish the new version.

