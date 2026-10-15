import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@/context/AppContext';
import type { ColumnInfo, DatasetInfo, ModelRunBody, ModelRunJob } from '@/data/api';
import { RealDataComparison } from './RealDataComparison';

const col = (name: string, unique: number, numeric: boolean): ColumnInfo => ({ name, type: numeric ? 'continuous' : 'categorical', numeric, unique, missing: 0, examples: [], likelyId: false, warnings: [] });
const dataset = (id: string): DatasetInfo => ({
  id,
  name: `${id}.csv`,
  size: 1,
  rows: 100,
  columns: [col('x1', 50, true), col('x2', 50, true), col('sinif', 2, false)],
  createdAt: '2026-01-01',
  parentId: null,
  operations: null,
});
const job = (id: string, datasetId: string, folds: number, seed = 7): ModelRunJob => ({
  id,
  datasetId,
  status: 'running',
  progress: { done: 1, total: 10, model: 'Lojistik', fold: 1 },
  elapsedSeconds: 3,
  spec: { target: 'sinif', numeric: ['x1'], categorical: [], numericCategorical: [], targetNumeric: false, folds, seed, models: ['baseline', 'logistic'] },
});

type Reply = { status: number; body?: unknown } | 'network';
let jobs: Record<string, Reply>;
let calls: string[];
let posted: ModelRunBody[];
let gate: Promise<void> | null;
let clients: QueryClient[];

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      let reply: Reply = { status: 404, body: { error: { code: 'not_found', message: 'yok' } } };
      if (url === '/api/datasets') reply = { status: 200, body: { datasets: [dataset('a'), dataset('b')] } };
      else if (init?.method === 'POST' && url === '/api/datasets/a/model-runs') {
        const body = JSON.parse(String(init.body)) as ModelRunBody;
        posted.push(body);
        const j = job('job-yeni', 'a', body.folds, body.seed);
        j.spec = { ...j.spec, ...body };
        jobs['job-yeni'] = { status: 200, body: j };
        reply = { status: 202, body: j };
      } else if (url.startsWith('/api/model-runs/')) {
        if (gate) await gate;
        reply = jobs[url.split('/').pop()!] ?? reply;
      }
      if (reply === 'network') throw new TypeError('fail');
      return new Response(JSON.stringify(reply.body), { status: reply.status });
    }),
  );
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppProvider>
          <RealDataComparison />
        </AppProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const jobCalls = () => calls.filter((c) => c.includes('/api/model-runs/'));
const posts = () => calls.filter((c) => c.startsWith('POST'));
const startButton = () => screen.getByRole('button', { name: /Karşılaştırmayı başlat|Çalışıyor/ });

describe('RealDataComparison: iş kimliğinin oturumda korunması', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem('statadvisor.dataset', 'a');
    calls = [];
    posted = [];
    jobs = {};
    gate = null;
    clients = [];
    mockFetch();
  });
  afterEach(() => {
    cleanup();
    clients.forEach((c) => c.clear());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('başarılı başlatma işi kaydeder; yeniden bağlanınca aynı iş ilk ayarlarıyla yoklanır ve ikinci POST atılmaz', async () => {
    const first = mount();
    await screen.findByText('Karşılaştırma kurulumu');
    fireEvent.change(screen.getByLabelText(/Tohum/), { target: { value: '7' } });
    fireEvent.click(startButton());
    await waitFor(() => expect(sessionStorage.getItem('statadvisor.modelRun.a')).toBe('job-yeni'));
    expect(posted).toHaveLength(1);
    expect(posted[0]!.seed).toBe(7);
    await waitFor(() => expect(jobCalls()).toContain('GET /api/model-runs/job-yeni'));

    first.unmount();
    clients.forEach((c) => c.clear());
    calls = [];
    mount();

    expect(await screen.findByText(/Çalışıyor$/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Tohum/)).toHaveValue('7'));
    expect(jobCalls()).toContain('GET /api/model-runs/job-yeni');
    expect(posts()).toEqual([]);
  });

  it('yeniden bağlanınca kayıtlı işi yoklar ve formu işin ayarlarına getirir', async () => {
    sessionStorage.setItem('statadvisor.modelRun.a', 'job-a');
    jobs['job-a'] = { status: 200, body: job('job-a', 'a', 10) };
    mount();
    expect(await screen.findByText(/Çalışıyor$/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Katman sayısı')).toHaveValue('10'));
    expect(screen.getByLabelText(/Tohum/)).toHaveValue('7');
    expect(posts()).toEqual([]);
  });

  it('kayıtlı işin ilk durumu gelene kadar başlat düğmesi kapalıdır ve form kullanıcının seçimini korur', async () => {
    sessionStorage.setItem('statadvisor.modelRun.a', 'job-a');
    jobs['job-a'] = { status: 200, body: job('job-a', 'a', 10) };
    let release!: () => void;
    gate = new Promise<void>((r) => {
      release = r;
    });
    mount();
    await screen.findByText('Karşılaştırma kurulumu');
    await waitFor(() => expect(jobCalls()).toHaveLength(1));
    expect(startButton()).toBeDisabled();
    fireEvent.click(startButton());
    expect(posts()).toEqual([]);

    fireEvent.change(screen.getByLabelText(/Tohum/), { target: { value: '99' } });
    release();
    expect(await screen.findByText(/Çalışıyor$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tohum/)).toHaveValue('99');
    expect(screen.getByLabelText('Katman sayısı')).toHaveValue('5');
    expect(posts()).toEqual([]);
  });

  it('veri setleri arasında yalıtılır', async () => {
    sessionStorage.setItem('statadvisor.modelRun.b', 'job-b');
    jobs['job-b'] = { status: 200, body: job('job-b', 'b', 10) };
    mount();
    await screen.findByText('Karşılaştırma kurulumu');
    expect(jobCalls()).toEqual([]);
    expect(screen.queryByText(/Çalışıyor$/)).not.toBeInTheDocument();
  });

  it('kesin 404 gelirse eski başvuruyu siler ve yeni iş başlatmaz', async () => {
    sessionStorage.setItem('statadvisor.modelRun.a', 'job-eski');
    mount();
    await waitFor(() => expect(sessionStorage.getItem('statadvisor.modelRun.a')).toBeNull());
    expect(screen.queryByText('Durum alınamadı')).not.toBeInTheDocument();
    await waitFor(() => expect(startButton()).toBeEnabled());
    expect(posts()).toEqual([]);
  });

  it('geçici ağ hatasında başvuruyu korur', async () => {
    sessionStorage.setItem('statadvisor.modelRun.a', 'job-a');
    jobs['job-a'] = 'network';
    mount();
    expect(await screen.findByText('Durum alınamadı')).toBeInTheDocument();
    expect(sessionStorage.getItem('statadvisor.modelRun.a')).toBe('job-a');
  });

  it('geçersiz kayıtlı değeri yok sayar', async () => {
    sessionStorage.setItem('statadvisor.modelRun.a', '../../x?y');
    mount();
    await screen.findByText('Karşılaştırma kurulumu');
    expect(jobCalls()).toEqual([]);
  });

  it('sessionStorage okuması engelliyse sayfa yine çalışır', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => {
      if (k.startsWith('statadvisor.modelRun')) throw new Error('engelli');
      return k === 'statadvisor.dataset' ? 'a' : null;
    });
    mount();
    expect(await screen.findByText('Karşılaştırma kurulumu')).toBeInTheDocument();
    expect(jobCalls()).toEqual([]);
  });

  it('sessionStorage yazması başarısız olsa da başlatılan iş bu açılışta izlenir', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k) => {
      if (k.startsWith('statadvisor.modelRun')) throw new Error('kota');
    });
    mount();
    await screen.findByText('Karşılaştırma kurulumu');
    fireEvent.click(startButton());
    expect(await screen.findByText(/Çalışıyor$/)).toBeInTheDocument();
    expect(posts()).toHaveLength(1);
    expect(sessionStorage.getItem('statadvisor.modelRun.a')).toBeNull();
  });

  it('sessionStorage silmesi başarısız olsa da kesin 404 sayfayı çökertmez', async () => {
    sessionStorage.setItem('statadvisor.modelRun.a', 'job-eski');
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((k) => {
      if (k.startsWith('statadvisor.modelRun')) throw new Error('engelli');
    });
    mount();
    await waitFor(() => expect(remove).toHaveBeenCalledWith('statadvisor.modelRun.a'));
    await waitFor(() => expect(startButton()).toBeEnabled());
    expect(screen.getByText('Karşılaştırma kurulumu')).toBeInTheDocument();
    expect(screen.queryByText('Durum alınamadı')).not.toBeInTheDocument();
  });
});
