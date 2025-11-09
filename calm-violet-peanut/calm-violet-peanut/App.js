

import { NavigationContainer  } from '@react-navigation/native';
import { SettingsProvider } from './contexts/SettingsContext';
import { AuthProvider } from './contexts/AuthContext'
import RootNavigator from './navigation/RootNavigator'


export default function App() { 
  return ( 
    <AuthProvider> 
      <SettingsProvider> 
        <NavigationContainer> 
          <RootNavigator /> 
        </NavigationContainer> 
      </SettingsProvider> 
    </AuthProvider> 
  ); 
}
