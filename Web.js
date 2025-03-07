import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  TextInput,
} from "react-native";
import { BleManager } from "react-native-ble-plx";
import { request, PERMISSIONS, RESULTS } from "react-native-permissions";
import * as SecureStore from "expo-secure-store";

const Web = () => {
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(null);
  const bleManager = Platform.OS !== "web" ? new BleManager() : null;

  useEffect(() => {
    checkLogin();
    return () => {
      if (bleManager) {
        bleManager.destroy();
      }
    };
  }, []);

  const saveToken = async (accessToken) => {
    if (Platform.OS === "web") {
      localStorage.setItem("access_token", accessToken);
    } else {
      await SecureStore.setItemAsync("access_token", accessToken);
    }
  };

  const getToken = async () => {
    if (Platform.OS === "web") {
      return localStorage.getItem("access_token");
    } else {
      return await SecureStore.getItemAsync("access_token");
    }
  };

  const checkLogin = async () => {
    const storedToken = await getToken();
    if (storedToken) {
      setToken(storedToken);
      setLoggedIn(true);
    }
  };

  const login = async () => {
    try {
      const response = await fetch("https://admin-staging.leapcraft.com/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error("Login failed");
      const data = await response.json();
      await saveToken(data.data.access_token);
      setToken(data.data.access_token);
      setLoggedIn(true);
    } catch (error) {
      Alert.alert("Login Error", error.message);
    }
  };

  const logout = async () => {

    if (Platform.OS === "web") {
      if (connectedDevice && connectedDevice.gattServer) {
        connectedDevice.gattServer.disconnect();
        setConnectedDevice(null);
      }
      localStorage.removeItem("access_token");
      
    } else {
      if (connectedDevice) {
        await bleManager.cancelDeviceConnection(connectedDevice.id);
        setConnectedDevice(null);
        Alert.alert("Disconnected", "Device has been disconnected.");
      }
      await SecureStore.deleteItemAsync("access_token");
    }
    setLoggedIn(false);
    setDevices([]);
    setConnectedDevice(null);
    setToken(null);
  };

  const requestPermissions = async () => {
    if (Platform.OS === "web") {
      if (!navigator.bluetooth) {
        Alert.alert("Error", "Web Bluetooth is not supported on this browser.");
        return false;
      }
      return true;
    } else if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        if (
          granted["android.permission.BLUETOOTH_SCAN"] !== PermissionsAndroid.RESULTS.GRANTED ||
          granted["android.permission.BLUETOOTH_CONNECT"] !== PermissionsAndroid.RESULTS.GRANTED ||
          granted["android.permission.ACCESS_FINE_LOCATION"] !== PermissionsAndroid.RESULTS.GRANTED
        ) {
          Alert.alert("Permission Denied", "Bluetooth permissions are required.");
          return false;
        }
        return true;
      } catch (error) {
        Alert.alert("Permission Error", error.message);
        return false;
      }
    } else if (Platform.OS === "ios") {
      const result = await request(PERMISSIONS.IOS.BLUETOOTH_PERIPHERAL);
      if (result !== RESULTS.GRANTED) {
        Alert.alert("Permission Denied", "Bluetooth access is required.");
        return false;
      }
      return true;
    }
    return true;
  };

  const scanDevices = async () => {
    if (!loggedIn) return;
    const permissionGranted = await requestPermissions();
    if (!permissionGranted) return;

    if (Platform.OS === "web") {
      try {
        const btDevice = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
        });
        setDevices([{ id: btDevice.id, name: btDevice.name || "Unknown Device", device: btDevice, connected: false }]);
      } catch (error) {
        Alert.alert("Scan Error", error.message);
      }
    } else {
      setDevices([]);
      setScanning(true);
      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          Alert.alert("Scan Error", error.message);
          setScanning(false);
          return;
        }
        if (device.name && !devices.some((d) => d.id === device.id)) {
          setDevices((prev) => [
            ...prev.filter((d) => d.id !== device.id),
            {
              id: device.id,
              name: device.name,
              rssi: device.rssi,
              localName: device.localName,
            },
          ]);
        }
      });
      setTimeout(() => {
        bleManager.stopDeviceScan();
        setScanning(false);
        Alert.alert("Scan Complete", "Scanning stopped after 2 minutes.");
      }, 120000);
    }
  };

 
  const connectToDevice = async (item) => {
    if (Platform.OS === "web") {
      try {
        const btDevice = item.device ? item.device : item;
        // Connecting via GATT server
        const gattServer = await btDevice.gatt.connect();
        setConnectedDevice({ id: btDevice.id, name: btDevice.name, gattServer });
        Alert.alert("Connected", `Connected to ${btDevice.name}`);
      } catch (error) {
        Alert.alert("Connection Failed", error.message);
      }
    } else {
      try {
        const connected = await bleManager.connectToDevice(item.id);
        await connected.discoverAllServicesAndCharacteristics();
        setConnectedDevice(connected);
        Alert.alert("Connected", `Connected to ${item.name}`);
      } catch (error) {
        Alert.alert("Connection Failed", error.message);
      }
    }
  };

  const disconnectDevice = async () => {
    if (Platform.OS === "web") {
      if (connectedDevice && connectedDevice.gattServer) {
        connectedDevice.gattServer.disconnect();
        setConnectedDevice(null);
        Alert.alert("Disconnected", "Device has been disconnected.");
      }
    } else {
      if (connectedDevice) {
        await bleManager.cancelDeviceConnection(connectedDevice.id);
        setConnectedDevice(null);
        Alert.alert("Disconnected", "Device has been disconnected.");
      }
    }
  };


  return (
    <View style={styles.container}>
      {!loggedIn ? (
        <>
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
          />
          <TouchableOpacity onPress={login} style={styles.loginButton}>
            <Text style={styles.buttonText}>Login</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <TouchableOpacity
            onPress={scanDevices}
            disabled={scanning}
            style={[styles.scanButton, scanning && { backgroundColor: "gray" }]}
          >
            <Text style={styles.buttonText}>{scanning ? "Scanning..." : "Scan Bluetooth Devices"}</Text>
          </TouchableOpacity>
          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.deviceContainer}>
                <View>
                 <Text style={styles.deviceText}>{item.name || "Unknown Device"}</Text>
                 <Text style={styles.deviceDetails}>ID: {item.id}</Text>
                 {item.rssi && <Text style={styles.deviceDetails}>RSSI: {item.rssi}</Text>}
                 {item.localName && <Text style={styles.deviceDetails}>Local Name: {item.localName}</Text>}
               </View>
               {connectedDevice?.id === item.id ? (
                  <TouchableOpacity style={styles.connectedButton}>
                    <Text style={styles.connectText}>Connected</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.connectButton} onPress={() => connectToDevice(item)}>
                    <Text style={styles.connectText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />

          {connectedDevice && (
            <View style={styles.connectedDeviceContainer}>
              <Text style={styles.connectedTitle}>Connected Device:</Text>
              <Text style={styles.deviceText}>{connectedDevice.name || "Unknown Device"}</Text>
              <Text style={styles.deviceDetails}>ID: {connectedDevice.id}</Text>
              <TouchableOpacity style={styles.disconnectButton} onPress={disconnectDevice}>
                <Text style={styles.connectText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={logout} style={styles.logoutButton}>
            <Text style={styles.buttonText}>Logout</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#e0f7fa",
  },
  input: {
    width: "80%",
    padding: 12,
    marginBottom: 15,
    borderColor: "#00796b",
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 16,
    color: "#00796b",
  },
  loginButton: {
    backgroundColor: "#00796b",
    padding: 12,
    borderRadius: 8,
    width: "80%",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
  },
  scanButton: {
    backgroundColor: "#0288d1",
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    width: "80%",
    alignItems: "center",
  },
  deviceContainer: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderColor: "#00796b",
    borderWidth: 1,
    width: "80%",
  },
  deviceText: {
    fontSize: 16,
    color: "#0288d1",
  },
  deviceButton: {
    backgroundColor: "#f57c00",
    padding: 8,
    borderRadius: 8,
    marginTop: 10,
    alignItems: "center",
  },
  connectedButton: {
    backgroundColor: "#388e3c",
  },
  logoutButton: {
    backgroundColor: "#f44336",
    padding: 12,
    borderRadius: 8,
    width: "80%",
    alignItems: "center",
  },
  deviceContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  deviceText: { fontSize: 16, fontWeight: "bold" },
  deviceDetails: { fontSize: 14, color: "#666" },
  connectButton: { backgroundColor: "#28a745", padding: 10, borderRadius: 10 },
  connectedButton: { backgroundColor: "#17a2b8", padding: 10, borderRadius: 10 },
  connectText: { color: "#fff", fontSize: 14 },
  connectedDeviceContainer: {
    marginTop: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: "#007bff",
    borderRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  connectedTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  disconnectButton: { backgroundColor: "#dc3545", padding: 10, borderRadius: 10, marginTop: 10 },

});

export default Web;

