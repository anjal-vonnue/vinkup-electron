import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../../context/Useauth';
import { useIsFullscreen } from '../../hooks/useIsFullscreen';
import { requestAppFullscreen } from '../../lib/fullscreen';
import styles from './FullscreenGate.module.css';

function Overlay() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  function handleEnter() {
    // The call runs synchronously inside the click, so the browser allows it.
    void requestAppFullscreen().then((ok) => setFailed(!ok));
  }

  return (
    // Stops Ctrl/Cmd+S and Ctrl/Cmd+Enter reaching TaskWorkspace's window listeners while blocked.
    // Tab, Enter and Space on the button still work: only propagation is stopped.
    <div className={styles.overlay} onKeyDown={(event) => event.stopPropagation()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fullscreen-gate-title"
        aria-describedby="fullscreen-gate-text"
        className={styles.dialog}
      >
        <h2 id="fullscreen-gate-title" className={styles.title}>
          Fullscreen required
        </h2>
        <p id="fullscreen-gate-text">
          You can work on the platform only in fullscreen. Leaving fullscreen or switching tabs is
          noted for your mentor.
        </p>
        {failed && (
          <p role="alert" className={styles.error}>
            Your browser did not allow fullscreen. Use a desktop browser such as Chrome, Edge or
            Firefox, then try again.
          </p>
        )}
        <button ref={buttonRef} type="button" className={styles.button} onClick={handleEnter}>
          Enter fullscreen
        </button>
      </div>
    </div>
  );
}

/** Blocks the whole app for signed-in trainees until the page is fullscreen. */
export default function FullscreenGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const isFullscreen = useIsFullscreen();
  // full screen is only mandatory for trainees
  const isBlocked =
    isAuthenticated && user?.role !== 'mentor' && user?.role !== 'manager' && !isFullscreen;

  return (
    <>
      {/* inert: no clicks, focus or screen-reader access underneath. Still mounted, so Monaco,
          the terminal and the running server survive. */}
      <div className={styles.content} inert={isBlocked}>
        {children}
      </div>
      {isBlocked && <Overlay />}
    </>
  );
}
