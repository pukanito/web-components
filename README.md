# Web components

## Prerequisites

- nvm installed

## Setup

- create .nvmrc and set the required node version (we use v20)
- run `nvm use` to use the required node version
- run `npx create-nx-workspace@latest --preset=web-components --appName=demo` to initialize nx,
  it will create a new subdirectory with the name specified during initialization. 
  The subdirectory will contain the nx project. Settings used:
  - Where would you like to create your workspace? · web-components
  - Which CI provider would you like to use? · skip
  - Would you like remote caching to make your build faster? · skip
- run `npm install @ngneat/spectator --save-dev`
- run `npm install --save-dev @testing-library/dom`

## Carousel library

- run `npx nx g @nx/js:lib libs/carousel --publishable --importPath=@pukanito/carousel` from the 'web-components' directory to add a library. Settings used:
  - Which bundler would you like to use to build the library? Choose 'none' to skip build setup. · vite
  - Which linter would you like to use? · eslint
  - Which unit test runner would you like to use? · jest

