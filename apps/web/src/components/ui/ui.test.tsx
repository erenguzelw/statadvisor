import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CopyButton } from './CopyButton';
import { SegmentedControl } from './SegmentedControl';
import { Tabs } from './Tabs';

describe('CopyButton', () => {
  it('metni panoya kopyalar ve onay gösterir', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    render(<CopyButton text="print(1)" label="Kodu kopyala" />);

    await user.click(screen.getByRole('button', { name: 'Kodu kopyala' }));

    expect(writeText).toHaveBeenCalledWith('print(1)');
    expect(screen.getByRole('button', { name: 'Kopyalandı' })).toBeInTheDocument();
  });
});

function Segmented() {
  const [value, setValue] = useState<'a' | 'b'>('a');
  return (
    <SegmentedControl
      label="Seviye"
      value={value}
      onChange={setValue}
      options={[
        { value: 'a', label: 'Yeni Başlayan' },
        { value: 'b', label: 'Uzman' },
      ]}
    />
  );
}

describe('SegmentedControl', () => {
  it('ok tuşlarıyla seçimi değiştirir ve odağı taşır', async () => {
    const user = userEvent.setup();
    render(<Segmented />);
    const novice = screen.getByRole('radio', { name: 'Yeni Başlayan' });
    expect(novice).toHaveAttribute('aria-checked', 'true');

    await user.tab();
    expect(novice).toHaveFocus();
    await user.keyboard('{ArrowRight}');

    const expert = screen.getByRole('radio', { name: 'Uzman' });
    expect(expert).toHaveAttribute('aria-checked', 'true');
    expect(expert).toHaveFocus();
  });
});

function TabsHarness() {
  const [value, setValue] = useState<'py' | 'r'>('py');
  return (
    <Tabs label="Dil" value={value} onChange={setValue} items={[{ value: 'py', label: 'Python' }, { value: 'r', label: 'R' }]}>
      <p>İçerik: {value}</p>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('ok tuşları ve End ile sekme değiştirir', async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    await user.tab();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'R' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('İçerik: r');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Python' })).toHaveAttribute('aria-selected', 'true');
  });
});
