import GlideSelect from './GlideSelect';
export default function MobileServiceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="lcsm-select">
      <span>{label}</span>
      <GlideSelect
        className="lcsm-glide"
        ariaLabel={label}
        value={value}
        options={options}
        onChange={onChange}
        size="lg"
      />
    </div>
  );
}
