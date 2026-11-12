export const environment = {
  production: false,
  // Empty so requests go to the dev server's own origin and are forwarded by
  // proxy.conf.json. Pointing at the absolute Azure URL made every local request
  // cross-origin and bypassed the proxy entirely.
  apiUrl: '',
  googleClientId: '670515710919-o1roc1k3kvdoqkv2vd2r7i2i1ptdstm0.apps.googleusercontent.com'
};
