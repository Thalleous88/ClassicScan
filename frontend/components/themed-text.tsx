import { Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

const TYPE_CLASSES: Record<NonNullable<ThemedTextProps['type']>, string> = {
  default: 'text-base leading-6 font-sans',
  defaultSemiBold: 'text-base leading-6 font-semibold',
  title: 'text-[32px] leading-[32px] font-bold',
  subtitle: 'text-xl font-bold',
  link: 'text-base leading-[30px] font-sans',
};

export function ThemedText({
  style,
  className,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps & { className?: string }) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const isLink = type === 'link';

  return (
    <Text
      className={`${TYPE_CLASSES[type]} ${className ?? ''}`.trim()}
      style={[isLink ? { color: '#0a7ea4' } : { color }, style]}
      {...rest}
    />
  );
}
