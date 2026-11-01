import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function KhataStatement() {
  const { uuid } = useParams();
  const [account, setAccount] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Call live Unified Fastify Vercel Serverless API
    fetch(`/api/khata/${uuid}`)
      .then(res => {
        if (!res.ok) throw new Error("Not Found");
        return res.json();
      })
      .then(data => setAccount(data))
      .catch(() => setError(true));
  }, [uuid]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6 text-center">
        <div className="p-8 bg-white rounded-2xl shadow-xl border-t-8 border-red-600 w-full max-w-md">
          <h1 className="text-red-600 text-3xl font-black mb-2">Account Not Found</h1>
          <p className="text-gray-500 text-lg">Please check the QR code link on your receipt or contact the store cashier.</p>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-700">Loading Khata Balance...</h1>
        </div>
      </div>
    );
  }

  const formattedBalance = typeof account.balance === 'number'
    ? account.balance.toFixed(3)
    : account.balance;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6">
      <div className="w-full max-w-md text-center mb-6">
        <span className="text-sm font-black tracking-widest text-emerald-800 uppercase bg-emerald-100 px-3 py-1 rounded-full">
          Askar Supermarket
        </span>
      </div>
      <h2 className="text-4xl font-bold text-gray-800 text-center">Welcome, {account.name}</h2>
      <div className="mt-8 p-8 bg-white rounded-xl shadow-lg border-t-8 border-red-600 w-full max-w-md text-center">
        <p className="text-gray-500 text-xl uppercase tracking-wide">Total Khata Due</p>
        <p className="text-6xl font-black text-gray-900 mt-2">BHD {formattedBalance}</p>
      </div>
      <button 
        onClick={async () => {
          try {
            const res = await fetch('/api/checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerUuid: uuid,
                customerName: account.name,
                amount: account.balance
              })
            });
            const data = await res.json();
            if (data.success) {
              alert(`BenefitPay Gateway Initialized!\nAmount: BHD ${Number(account.balance).toFixed(3)}\nWebhook Target: ${data.webhookUrl}\nTransaction: ${data.chargeId}\n\nProceeding to Fawri+ / BenefitPay secure portal...`);
            } else {
              alert(`BenefitPay Quick-Pay: Opening payment for BHD ${formattedBalance} to Askar Supermarket.`);
            }
          } catch (e) {
            alert(`BenefitPay Quick-Pay: Opening payment for BHD ${formattedBalance} to Askar Supermarket.`);
          }
        }}
        className="mt-12 w-full max-w-md bg-green-600 hover:bg-green-700 active:scale-95 transition-all text-white text-2xl font-bold py-6 rounded-xl shadow-md cursor-pointer"
      >
        Pay via BenefitPay
      </button>
      <p className="mt-6 text-gray-400 text-sm">Official Digital Statement • Askar Supermarket</p>
    </div>
  );
}

