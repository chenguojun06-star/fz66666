import { useEffect, useState } from 'react';

export function useKeyboardVisible() {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    if (typeof visualViewport === 'undefined') return;

    const onResize = () => {
      const vv = visualViewport;
      const isKeyboard = vv.height < window.innerHeight - 100;
      setKeyboardVisible(isKeyboard);
      document.querySelectorAll('.footer-bar').forEach((el) => {
        if (isKeyboard) {
          el.classList.add('keyboard-visible');
        } else {
          el.classList.remove('keyboard-visible');
        }
      });
    };

    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  return keyboardVisible;
}
