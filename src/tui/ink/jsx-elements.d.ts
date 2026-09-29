// Ink custom elements rendered by the Ink reconciler. React 19 types put the
// JSX namespace under React (React.JSX). Register the custom elements there.
import type * as React from 'react';

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'ink-box': any;
        'ink-text': any;
        'ink-link': any;
        'ink-raw-ansi': any;
      }
    }
  }
}
export {};
