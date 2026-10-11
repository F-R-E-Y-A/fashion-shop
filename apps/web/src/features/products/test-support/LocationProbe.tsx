import { useLocation } from 'react-router-dom';

/** Hien search cua vi tri hien tai de test assert URL thay doi sau khi trang goi setSearchParams. */
export function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location-search">{location.search}</p>;
}
