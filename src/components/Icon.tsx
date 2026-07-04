import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';

export type IconName = string;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  style?: object;
};

export function Icon({ name, size = 20, color = colors.ink, style }: Props) {
  return <Feather name={name} size={size} color={color} style={style} />;
}
