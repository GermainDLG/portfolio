"""Integration checks for the isolated, AI-free portfolio configuration."""
import sys
from unittest import skipUnless
from unittest.mock import patch
from django.conf import settings
from django.test import Client, TransactionTestCase
from channels.testing import WebsocketCommunicator
from alienstocksim.models import Profile, StockEntry
from alienstocksim.views import generate_headline_batch


@skipUnless(getattr(settings, 'PORTFOLIO_DEMO', False), 'Requires the isolated portfolio settings')
class PortfolioDemoTests(TransactionTestCase):
    def test_guest_sessions_and_trading(self):
        first, second = Client(), Client()
        self.assertEqual(first.get('/home').status_code, 200)
        self.assertEqual(second.get('/home').status_code, 200)
        self.assertNotEqual(first.session['_auth_user_id'], second.session['_auth_user_id'])
        for action, quantity in [('buy', 2), ('sell', 0)]:
            result = first.post('/trade/', data={
                'company': 'Pear', 'action': action, 'price': 100, 'amount': 2,
            }, content_type='application/json')
            self.assertEqual(result.status_code, 200, result.content)
            holding = StockEntry.objects.get(profile__user_id=first.session['_auth_user_id'])
            self.assertEqual(holding.quantity, quantity)
        self.assertEqual(Profile.objects.get(user_id=first.session['_auth_user_id']).liquid_money, 10000)
        self.assertNotContains(first.get('/home'), 'Loading headlines')

    def test_ai_disabled_without_sdk(self):
        self.assertEqual(generate_headline_batch(), [])
        self.assertNotIn('google.genai', sys.modules)

    async def test_websocket_delivers_prices_without_external_calls(self):
        from webapps.portfolio_asgi import application
        from alienstocksim.consumers import StockConsumer
        with patch('alienstocksim.consumers.requests.get', side_effect=AssertionError('External API called')):
            socket = WebsocketCommunicator(application, '/ws/alienstocksim/')
            try:
                connected, _ = await socket.connect(timeout=5)
                self.assertTrue(connected)
                for _ in range(6):
                    event = await socket.receive_json_from(timeout=5)
                    if event['type'] == 'stock_price':
                        self.assertGreater(event['price'], 0)
                        break
                else:
                    self.fail('No live price received')
                self.assertIsNone(StockConsumer.headline_task)
            finally:
                await socket.disconnect()
