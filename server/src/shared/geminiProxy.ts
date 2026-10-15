import { Dispatcher } from 'undici';

export function routeHostsThroughProxy(
  direct: Dispatcher,
  proxy: Dispatcher,
  hostnames: string[],
): Dispatcher {
  const hosts = new Set(hostnames);
  return direct.compose((dispatch) => (options, handler) => {
    if (options.origin && hosts.has(new URL(options.origin).hostname)) {
      return proxy.dispatch(options, handler);
    }
    return dispatch(options, handler);
  });
}

export function routeGeminiRequests(direct: Dispatcher, proxy: Dispatcher): Dispatcher {
  return routeHostsThroughProxy(direct, proxy, [
    'generativelanguage.googleapis.com',
  ]);
}
