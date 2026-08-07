import streamlit as st
import sqlite3
import pandas as pd
import os
from datetime import datetime

DB_PATH = "/home/anton/criptobot/data/criptobot.db"

st.set_page_config(
    page_title="Criptobot - Polymarket Radar Dashboard",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.markdown("""
<style>
    .main {
        background-color: #0d1117;
        color: #c9d1d9;
    }
    .stMetric label {
        color: #8b949e !important;
        font-size: 0.9rem !important;
    }
    .stMetric div[data-testid="stMetricValue"] {
        color: #58a6ff !important;
        font-size: 1.8rem !important;
        font-weight: 700 !important;
    }
    h1, h2, h3 {
        color: #f0f6fc !important;
    }
</style>
""", unsafe_allow_html=True)

def get_db_connection():
    if not os.path.exists(DB_PATH):
        return None
    return sqlite3.connect(DB_PATH)

st.title("⚡ Criptobot - Radar de Estudio Cripto (Polymarket)")
st.caption("🟢 MONITOREO 24/7 EN VIVO EN VPS (FASE 1 ESTUDIO) - PUERTO 8504")
st.write("")

conn = get_db_connection()

if conn is None:
    st.error("⚠️ Base de datos no encontrada. Esperando inicio de servicios...")
else:
    try:
        c1, c2, c3, c4 = st.columns(4)
        
        n_markets = pd.read_sql("SELECT COUNT(*) as cnt FROM crypto_markets", conn)['cnt'].iloc[0]
        n_trades = pd.read_sql("SELECT COUNT(*) as cnt FROM crypto_whale_trades", conn)['cnt'].iloc[0]
        n_whales = pd.read_sql("SELECT COUNT(DISTINCT wallet) as cnt FROM crypto_whale_trades", conn)['cnt'].iloc[0]
        
        tables = pd.read_sql("SELECT name FROM sqlite_master WHERE type='table'", conn)['name'].values
        n_lags = pd.read_sql("SELECT COUNT(*) as cnt FROM price_discrepancies", conn)['cnt'].iloc[0] if 'price_discrepancies' in tables else 0
        
        with c1:
            st.metric("Mercados Indexados", f"{n_markets:,}")
        with c2:
            st.metric("Trades Capturados 24/7", f"{n_trades:,}")
        with c3:
            st.metric("Billeteras Activas", f"{n_whales:,}")
        with c4:
            st.metric("Descalces Binance", f"{n_lags:,}")
            
        st.markdown("---")
        
        col_left, col_right = st.columns(2)
        
        with col_left:
            st.subheader("📊 Transacciones en Vivo (Últimos Trades)")
            df_trades = pd.read_sql('''
                SELECT timestamp as Timestamp, wallet as Wallet, market_title as Mercado, side as Lado, size_usdc as Monto_USDC, price as Precio
                FROM crypto_whale_trades
                ORDER BY id DESC LIMIT 15
            ''', conn)
            
            if not df_trades.empty:
                df_trades['Wallet'] = df_trades['Wallet'].apply(lambda x: f"{x[:8]}...{x[-4:]}" if x else "")
                df_trades['Monto_USDC'] = df_trades['Monto_USDC'].apply(lambda x: f"${x:,.2f}")
                df_trades['Precio'] = df_trades['Precio'].apply(lambda x: f"${x:.3f}")
                st.dataframe(df_trades, use_container_width=True)
            else:
                st.info("Sin trades registrados aún...")
                
        with col_right:
            st.subheader("🔎 Descalces Binance Spot vs Polymarket")
            if n_lags > 0:
                df_lags = pd.read_sql('''
                    SELECT timestamp as Timestamp, symbol as Cripto, binance_price as Binance_Spot, market_title as Mercado, polymarket_yes_price as YES_Precio
                    FROM price_discrepancies
                    ORDER BY id DESC LIMIT 15
                ''', conn)
                df_lags['Binance_Spot'] = df_lags['Binance_Spot'].apply(lambda x: f"${x:,.2f}")
                df_lags['YES_Precio'] = df_lags['YES_Precio'].apply(lambda x: f"${x:.3f}")
                st.dataframe(df_lags, use_container_width=True)
            else:
                st.info("El scanner de descalce está monitoreando en vivo...")

        st.markdown("---")
        st.subheader("👑 Ranking de Billeteras Cripto por Operaciones")
        df_ranking = pd.read_sql('''
            SELECT wallet as Wallet, COUNT(*) as Ops, SUM(size_usdc) as Vol_USDC, COUNT(DISTINCT market_title) as Mercados
            FROM crypto_whale_trades
            GROUP BY wallet
            ORDER BY Ops DESC, Vol_USDC DESC
            LIMIT 15
        ''', conn)
        
        if not df_ranking.empty:
            df_ranking['Wallet'] = df_ranking['Wallet'].apply(lambda x: f"{x[:10]}...{x[-6:]}")
            df_ranking['Vol_USDC'] = df_ranking['Vol_USDC'].apply(lambda x: f"${x:,.2f}")
            st.dataframe(df_ranking, use_container_width=True)
            
    except Exception as e:
        st.error(f"Error procesando datos: {e}")
    finally:
        conn.close()

time_now = datetime.now().strftime("%H:%M:%S")
st.caption(f"Última actualización visual: {time_now}")
