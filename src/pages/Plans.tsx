import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Plans page redirects to the real subscriptions/checkout page
export default function Plans() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/subscriptions', { replace: true });
  }, [navigate]);
  return null;
}
