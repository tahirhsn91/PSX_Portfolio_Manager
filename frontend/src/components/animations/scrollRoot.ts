import { createContext, useContext, type RefObject } from 'react';

/**
 * The app's one scroll container is `<main>`, never the window (`html, body`
 * are `overflow: hidden`). Scroll-linked effects — reveals, progress bars —
 * must observe `<main>` or they will never fire. MainLayout provides the ref
 * here so any descendant (pages render through `<Outlet/>`) can read it.
 */
export const ScrollRootContext = createContext<RefObject<HTMLElement | null> | null>(null);

export function useScrollRoot(): RefObject<HTMLElement | null> | null {
  return useContext(ScrollRootContext);
}
