declare module '*.svg' {
  const content: any;
  export default content;
}

// Erweitere InputHTMLAttributes für webkitdirectory
declare namespace React {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: string | boolean;
  }
}