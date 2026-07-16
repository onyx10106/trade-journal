const API_BASE_URL = '';

const apiUrl = (path) => {
  if (path.startsWith('/')) {
    return API_BASE_URL + path;
  }
  return API_BASE_URL + '/' + path;
};