import { Agent, Dispatcher } from 'undici';
import { routeGeminiRequests } from './geminiProxy';

describe('routeGeminiRequests', () => {
  it('proxies only the Gemini API origin', () => {
    const direct = new Agent();
    const proxy = new Agent();
    const directDispatch = jest.spyOn(direct, 'dispatch').mockReturnValue(true);
    const proxyDispatch = jest.spyOn(proxy, 'dispatch').mockReturnValue(true);
    const routed = routeGeminiRequests(direct, proxy);
    const handler = {} as Dispatcher.DispatchHandler;
    const dispatchTo = (origin: string) => routed.dispatch({ origin, path: '/', method: 'GET' }, handler);

    dispatchTo('https://generativelanguage.googleapis.com');
    dispatchTo('https://api.deepseek.com');
    dispatchTo('https://generativelanguage.googleapis.com.evil.test');

    expect(proxyDispatch).toHaveBeenCalledTimes(1);
    expect(directDispatch).toHaveBeenCalledTimes(2);
  });
});