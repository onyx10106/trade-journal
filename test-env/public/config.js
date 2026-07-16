const API_BASE_URL = 'http://121.43.49.195';

const apiUrl = (path) => {
  if (path.startsWith('/')) {
    return API_BASE_URL + path;
  }
  return API_BASE_URL + '/' + path;
};