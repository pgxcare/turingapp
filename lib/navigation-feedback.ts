export const NAVIGATION_FEEDBACK_EVENT = 'tt_navigation_feedback';

export type NavigationFeedbackDetail = {
  phase: 'start' | 'finish';
};

function emitNavigationFeedback(phase: NavigationFeedbackDetail['phase']) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<NavigationFeedbackDetail>(NAVIGATION_FEEDBACK_EVENT, {
      detail: { phase },
    })
  );
}

export function emitNavigationStart() {
  emitNavigationFeedback('start');
}

export function emitNavigationFinish() {
  emitNavigationFeedback('finish');
}
