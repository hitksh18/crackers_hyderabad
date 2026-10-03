import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // The single scroller is main.admin-main; the viewport never scrolls.
    const main = document.querySelector('main.admin-main');
    try {
      main?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch {
      if (main) main.scrollTop = 0;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
