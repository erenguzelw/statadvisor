import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpertiseToggle } from '@/components/layout/ExpertiseToggle';
import { analysis } from '@/data/mocks/analysis';
import { getModelReport } from '@/data/mocks/models';
import { defaultAnswers, type WizardAnswers } from '@/lib/decision';
import { renderWithApp } from '@/test/render';
import { AssumptionTestCard } from './AssumptionTestCard';
import { DecisionWizard } from './Decision';
import { InterpretationCard } from './InterpretationCard';
import { PValue, formatP, significance } from './PValue';
import { RedFlagCard } from './RedFlagCard';

describe('PValue', () => {
  it('anlamlılık kademesini belirler', () => {
    expect(significance(0.003)).toBe('strong');
    expect(significance(0.012)).toBe('significant');
    expect(significance(0.41)).toBe('none');
  });

  it('APA biçiminde baştaki sıfırı atar', () => {
    expect(formatP(0.003, true)).toBe('.003');
    expect(formatP(0.0004)).toBe('< 0.001');
  });

  it('kademeyi data özniteliğiyle işaretler', () => {
    renderWithApp(<PValue p={0.012} />);
    expect(screen.getByText(/0\.012/).closest('[data-significance]')).toHaveAttribute('data-significance', 'significant');
  });
});

describe('InterpretationCard + ExpertiseToggle', () => {
  it('Uzman seçilince istatistiksel gösterime geçer', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <>
        <ExpertiseToggle />
        <InterpretationCard result={analysis.result} />
      </>,
    );
    expect(screen.getByText(/binde 3/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Uzman' }));

    expect(screen.getByText(/H\(2\) = 11\.70/)).toBeInTheDocument();
    expect(screen.queryByText(/binde 3/)).not.toBeInTheDocument();
  });
});

function FlagHarness() {
  const [resolved, setResolved] = useState(false);
  return <RedFlagCard flag={getModelReport().redFlags[0]!} resolved={resolved} onResolve={() => setResolved(true)} />;
}

describe('RedFlagCard', () => {
  it('Uygula düğmesiyle çözüldü durumuna geçer', async () => {
    const user = userEvent.setup();
    renderWithApp(<FlagHarness />);
    await user.click(screen.getByRole('button', { name: 'Holm düzeltmesi uygula' }));
    expect(screen.getByText('Çözüldü')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Holm uygulandı' })).toBeDisabled();
  });
});

describe('AssumptionTestCard', () => {
  it('gerçek istatistiği gösterir ve "Bu ne demek?" açıklamasını seviyeye göre değiştirir', async () => {
    const user = userEvent.setup();
    const shapiro = analysis.assumptions.find((a) => a.id === 'shapiro')!;
    renderWithApp(
      <>
        <ExpertiseToggle />
        <AssumptionTestCard test={shapiro} />
      </>,
    );
    expect(screen.getByText(shapiro.statistic)).toBeInTheDocument();
    expect(screen.getByText('İhlal edildi')).toBeInTheDocument();
    expect(screen.getByText(/çan eğrisine benzeyip/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Uzman' }));
    expect(screen.getByText(/Royston, 1995/)).toBeInTheDocument();
  });
});

function WizardHarness({ onAnswers }: { onAnswers: (a: WizardAnswers) => void }) {
  const [a, setA] = useState<WizardAnswers>(defaultAnswers);
  onAnswers(a);
  return <DecisionWizard answers={a} onChange={setA} inferred={['groups', 'target']} />;
}

describe('DecisionWizard', () => {
  it('yanıtları değiştirir ve veriden çıkarılan soruları işaretler', async () => {
    const user = userEvent.setup();
    let latest = defaultAnswers;
    renderWithApp(<WizardHarness onAnswers={(a) => (latest = a)} />);
    expect(screen.getByText(/Kaç grubu karşılaştırıyorsunuz\? \(veriden çıkarıldı/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Evet, farklı kişiler/ }));
    expect(latest.design).toBe('independent');
    await user.click(screen.getByRole('radio', { name: '2 grup' }));
    expect(latest.groups).toBe('2');
  });
});
